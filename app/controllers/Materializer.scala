package controllers

import play.api.libs.json._
import play.api.libs.ws.WSClient
import sangria.ast
import sangria.schema._
import sangria.marshalling.MarshallingUtil._
import sangria.marshalling.playJson._
import sangria.marshalling.queryAst._
import sangria.schema.ResolverBasedAstSchemaBuilder.{resolveDirectives, extractValue}

import scala.concurrent.{ExecutionContext, Future}

class Materializer(client: WSClient)(implicit ec: ExecutionContext) {
  object Args {
    val HeaderType = InputObjectType("Header", fields = List(
      InputField("name", StringType),
      InputField("value", StringType)))

    val QueryParamType = InputObjectType("QueryParam", fields = List(
      InputField("name", StringType),
      InputField("value", StringType)))

    val IncludeType = InputObjectType("GraphQLSchemaInclude", fields = List(
      InputField("name", StringType),
      InputField("url", StringType)))

    val IncludeFieldsType = InputObjectType("GraphQLIncludeFields", fields = List(
      InputField("schema", StringType),
      InputField("type", StringType),
      InputField("fields", OptionInputType(ListInputType(StringType)))))

    val NameOpt = Argument("name", OptionInputType(StringType))
    val NameReq = Argument("name", StringType)
    val Path = Argument("path", OptionInputType(StringType))
    val JsonValue = Argument("value", StringType)
    val Url = Argument("url", StringType)
    val Headers = Argument("headers", OptionInputType(ListInputType(HeaderType)))
    val QueryParams = Argument("query", OptionInputType(ListInputType(QueryParamType)))
    val ForAll = Argument("forAll", OptionInputType(StringType))
    val Schemas = Argument("schemas", ListInputType(IncludeType))
    val Fields = Argument("fields", ListInputType(IncludeFieldsType))
  }

  object Dirs {
    val Context = Directive("context",
      arguments = Args.NameOpt :: Args.Path :: Nil, 
      locations = Set(DirectiveLocation.FieldDefinition))
    
    val Value = Directive("value",
      arguments = Args.NameOpt :: Args.Path :: Nil, 
      locations = Set(DirectiveLocation.FieldDefinition))
    
    val Arg = Directive("arg",
      arguments = Args.NameReq :: Nil, 
      locations = Set(DirectiveLocation.FieldDefinition))
    
    val JsonConst = Directive("jsonValue",
      arguments = Args.JsonValue :: Nil, 
      locations = Set(DirectiveLocation.FieldDefinition, DirectiveLocation.Schema))
    
    val HttpGet = Directive("httpGet",
      arguments = Args.Url :: Args.Headers :: Args.QueryParams :: Args.ForAll :: Nil,
      locations = Set(DirectiveLocation.FieldDefinition))

    val IncludeGraphQL = Directive("includeGraphQL",
      arguments = Args.Schemas :: Nil,
      locations = Set(DirectiveLocation.Schema))

    val IncludeField = Directive("include",
      arguments = Args.Fields :: Nil,
      locations = Set(DirectiveLocation.Object))
  }
  
  def schemaBuilder(ctx: MatCtx) = AstSchemaBuilder.resolverBased[MatCtx](
    AdditionalDirectives(Seq(Dirs.IncludeGraphQL)),
    AdditionalTypes(ctx.allTypes.toList),
    DirectiveResolver(Dirs.Context, c ⇒ c.withArgs(Args.NameOpt, Args.Path) { (name, path) ⇒
      name
        .map(n ⇒ extractValue(c.ctx.field.fieldType, c.ctx.ctx.vars.get(n)))
        .orElse(path.map(p ⇒ extractValue(c.ctx.field.fieldType, Some(JsonPath.query(p, c.ctx.ctx.vars)))))
        .getOrElse(throw SchemaMaterializationException(s"Can't find a directive argument 'path' or 'name'."))
    }),

    DirectiveResolver(Dirs.Value, c ⇒ c.withArgs(Args.NameOpt, Args.Path) { (name, path) ⇒
      def extract(value: Any) =
        name
          .map(n ⇒ extractValue(c.ctx.field.fieldType, value.asInstanceOf[JsValue].get(n)))
          .orElse(path.map(p ⇒ extractValue(c.ctx.field.fieldType, Some(JsonPath.query(p, value.asInstanceOf[JsValue])))))
          .getOrElse(throw SchemaMaterializationException(s"Can't find a directive argument 'path' or 'name'."))

      c.lastValue map (_.map(extract)) getOrElse extract(c.ctx.value)
    }),

    DirectiveResolver(Dirs.Arg, c ⇒
      extractValue(c.ctx.field.fieldType,
        convertArgs(c.ctx.args, c.ctx.astFields.head).get(c arg Args.NameReq))),

    DynamicDirectiveResolver[MatCtx, JsValue]("const", c ⇒
      extractValue(c.ctx.field.fieldType, Some(c.args.get("value") match {
        case Some(JsString(str)) ⇒ JsString(fillPlaceholders(c.ctx, str))
        case Some(jv) ⇒ jv
        case _ ⇒ JsNull
      }))),

    DirectiveResolver(Dirs.JsonConst, c ⇒
      extractValue(c.ctx.field.fieldType,
        Some(Json.parse(fillPlaceholders(c.ctx, c arg Args.JsonValue))))),

    DirectiveResolver(Dirs.HttpGet,
      complexity = Some(_ ⇒ (_, _, _) ⇒ 1000.0),
      resolve = c ⇒ c.withArgs(Args.Url, Args.Headers, Args.QueryParams, Args.ForAll) { (rawUrl, rawHeaders, rawQueryParams, forAll) ⇒
        val args = Some(convertArgs(c.ctx.args, c.ctx.astFields.head))

        def extractMap(in: Option[scala.Seq[InputObjectType.DefaultInput]], elem: JsValue) =
          rawHeaders.map(_.map(h ⇒ h("name").asInstanceOf[String] → fillPlaceholders(c.ctx, h("value").asInstanceOf[String], args, elem))).getOrElse(Nil)

        def makeRequest(tpe: OutputType[_], c: Context[MatCtx, _], args: Option[JsObject], elem: JsValue = JsNull) = {
          val url = fillPlaceholders(c, rawUrl, args, elem)
          val headers = extractMap(rawHeaders, elem)
          val query = extractMap(rawQueryParams, elem)
          val request = client.url(url).addHttpHeaders(headers: _*).addQueryStringParameters(query: _*)

          request.execute().map(resp ⇒ resp.json)
        }

        forAll match {
          case Some(elem) ⇒
            JsonPath.query(elem, c.ctx.value.asInstanceOf[JsValue]) match {
              case JsArray(elems) ⇒
                Future.sequence(elems.map(e ⇒ makeRequest(namedType(c.ctx.field.fieldType), c.ctx, args, e))) map { v ⇒
                  extractValue(c.ctx.field.fieldType, Some(JsArray(v.asInstanceOf[Seq[JsValue]]): JsValue))
                }
              case e ⇒
                makeRequest(c.ctx.field.fieldType, c.ctx, args, e)
            }
          case None ⇒
            makeRequest(c.ctx.field.fieldType, c.ctx, args)
        }
      }),

    ExistingFieldResolver {
      case (o: GraphQLIncludedSchema, _, f) if ctx.graphqlIncludes.exists(_.include.name == o.include.name) && f.astDirectives.exists(_.name == "delegate") ⇒
        val schema = ctx.graphqlIncludes.find(_.include.name == o.include.name).get

        c ⇒ {
          val query = ast.Document(Vector(ast.OperationDefinition(ast.OperationType.Query, selections = c.astFields)))

          ctx.request(schema, query, c.astFields.head.outputName)
        }
    },

    DirectiveFieldProvider(Dirs.IncludeField, _.withArgs(Args.Fields) { fields ⇒
      fields.toList.flatMap { f ⇒
        val name = f("schema").asInstanceOf[String]
        val typeName = f("type").asInstanceOf[String]
        val includes = f.get("fields").asInstanceOf[Option[Option[Seq[String]]]].flatten

        ctx.findFields(name, typeName, includes)
      }
    }),

    ExistingScalarResolver {
      case ctx ⇒ ctx.existing.copy(
        coerceUserInput = Right(_),
        coerceOutput = (v, _) ⇒ v,
        coerceInput = v ⇒ Right(queryAstInputUnmarshaller.getScalaScalarValue(v)))
    },

    AnyFieldResolver.defaultInput[MatCtx, JsValue])

  val rootValueLoc = Set(DirectiveLocation.Schema)

  def rootValue(schemaAst: ast.Document) = {
    val values = resolveDirectives(schemaAst,
      GenericDirectiveResolver(Dirs.JsonConst, rootValueLoc,
        c ⇒ Some(Json.parse(c arg Args.JsonValue))),
      GenericDynamicDirectiveResolver[JsValue, JsValue]("const", rootValueLoc,
        c ⇒ c.args.get("value")))

    JsObject(values.foldLeft(Map.empty[String, JsValue]) {
      case (acc, JsObject(vv)) ⇒ acc ++ vv
      case (acc, _) ⇒ acc
    })
  }

  def graphqlIncludes(schemaAst: ast.Document) =
    resolveDirectives(schemaAst,
      GenericDirectiveResolver(Dirs.IncludeGraphQL, resolve =
          c ⇒ Some(c.arg(Args.Schemas).map(s ⇒ GraphQLInclude(s("url").asInstanceOf[String], s("name").asInstanceOf[String]))))).flatten

  def loadIncludedSchemas(includes: Vector[GraphQLInclude]): Future[Vector[GraphQLIncludedSchema]] = {
    val loaded =
      includes.map { include ⇒
        val introspectionBody = Json.obj("query" → sangria.introspection.introspectionQuery.renderPretty)

        client.url(include.url).post(introspectionBody).map(resp ⇒
          GraphQLIncludedSchema(include, Schema.buildFromIntrospection(resp.json)))
      }

    Future.sequence(loaded)
  }

  def loadContext(schemaAst: ast.Document): Future[MatCtx] = {
    val includes = graphqlIncludes(schemaAst)
    val vars = rootValue(schemaAst)

    loadIncludedSchemas(includes).map(MatCtx(client, vars, _))
  }

  def namedType(tpe: OutputType[_]): OutputType[_] = tpe match {
    case ListType(of) ⇒ namedType(of)
    case OptionType(of) ⇒ namedType(of)
    case t ⇒ t
  }

  private def convertArgs(args: Args, field: ast.Field): JsObject =
    JsObject(args.raw.keys.flatMap(name ⇒ field.arguments.find(_.name == name).map(a ⇒ a.name → a.value.convertMarshaled[JsValue])).toMap)

  private val PlaceholderRegExp = """\$\{([^}]+)\}""".r

  private def render(value: JsValue) = value match {
    case JsString(s) ⇒ s
    case JsNumber(n) ⇒ "" + n
    case JsBoolean(b) ⇒ "" + b
    case v ⇒ "" + v
  }

  private def fillPlaceholders(ctx: Context[MatCtx, _], value: String, cachedArgs: Option[JsObject] = None, elem: JsValue = JsNull): String = {
    lazy val args = cachedArgs getOrElse convertArgs(ctx.args, ctx.astFields.head)

    PlaceholderRegExp.findAllMatchIn(value).toVector.foldLeft(value) { case (acc, p) ⇒
      val placeholder = p.group(0)

      val idx = p.group(1).indexOf(".")

      if (idx < 0) throw new IllegalStateException(s"Invalid placeholder '$placeholder'. It should contain two parts: scope (like value or ctx) and extractor (name of the field or JSON path) separated byt dot (.).")

      val (scope, selectorWithDot) = p.group(1).splitAt(idx)
      val selector = selectorWithDot.substring(1)

      val source = scope match {
        case "value" ⇒ ctx.value.asInstanceOf[JsValue]
        case "ctx" ⇒ ctx.ctx.vars
        case "arg" ⇒ args
        case "elem" ⇒ elem
        case s ⇒ throw new IllegalStateException(s"Unsupported placeholder scope '$s'. Supported scopes are: value, ctx, arg, elem.")
      }

      val value =
        if (selector.startsWith("$"))
          render(JsonPath.query(selector, source))
        else
          source.get(selector).map(render).getOrElse("")

      acc.replace(placeholder, value)
    }
  }

  implicit class JsonOps(value: JsValue) {
    def get(key: String) = value match {
      case JsObject(fields) ⇒ fields.get(key)
      case _ ⇒ None
    }
  }
}

case class MatCtx(client: WSClient, vars: JsValue, graphqlIncludes: Vector[GraphQLIncludedSchema]) {
  val allTypes = graphqlIncludes.flatMap(_.types)

  def request(schema: GraphQLIncludedSchema, query: ast.Document, extractName: String)(implicit ec: ExecutionContext): Future[JsValue] = {
    val body = Json.obj("query" → query.renderPretty)

    client.url(schema.include.url).post(body).map(resp ⇒ ((resp.json \ "data").get \ extractName).get)
  }

  def findFields(name: String, typeName: String, includeFields: Option[Seq[String]]): List[MaterializedField[MatCtx, _]] =
    graphqlIncludes.find(_.include.name == name).toList.flatMap { s ⇒
      val tpe = s.schema.getOutputType(ast.NamedType(typeName), topLevel = true)
      val fields = tpe.toList
        .collect {case obj: ObjectLikeType[_, _] ⇒ obj}
        .flatMap { t ⇒
          val fields = includeFields match  {
            case Some(inc) ⇒ t.uniqueFields.filter(f ⇒ includeFields contains f.name)
            case _ ⇒ t.uniqueFields
          }

          fields.asInstanceOf[Vector[Field[MatCtx, Any]]]
        }

      
      fields.map(f ⇒ MaterializedField(s, f.copy(astDirectives = Vector(ast.Directive("delegate", Vector.empty)))))
    }
}

case class GraphQLInclude(url: String, name: String)
case class GraphQLIncludedSchema(include: GraphQLInclude, schema: Schema[_, _]) extends MatOrigin {
  private val rootTypeNames = Set(schema.query.name) ++ schema.mutation.map(_.name).toSet ++ schema.subscription.map(_.name).toSet

  val types = schema.allTypes.values
    .filterNot(t ⇒ Schema.isBuiltInType(t.name) || rootTypeNames.contains(t.name)).toVector
    .map(MaterializedType(this, _))

  def description = s"included schema '${include.name}'"
}