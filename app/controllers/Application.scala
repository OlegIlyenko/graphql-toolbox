package controllers

import javax.inject.Inject

import akka.actor.ActorSystem
import play.api.libs.json.{JsObject, JsString, Json}
import play.api.libs.ws.WSClient
import play.api.mvc._
import play.api.Configuration
import sangria.execution._
import sangria.parser.{QueryParser, SyntaxError}
import sangria.marshalling.playJson._
import sangria.renderer.QueryRenderer
import sangria.schema.{Schema, SchemaMaterializationException}

import scala.concurrent.Future
import scala.util.control.NonFatal
import scala.util.{Failure, Success}

class Application @Inject()(system: ActorSystem, config: Configuration, client: WSClient) extends InjectedController {
  import system.dispatcher

  val materializer = new Materializer(client)

  val gaCode = config.getOptional[String]("gaCode")

  case class TooComplexQueryError(message: String) extends Exception(message)

  val complexityRejector = QueryReducer.rejectComplexQueries(20000, (complexity: Double, _: Any) ⇒
    TooComplexQueryError(s"Query complexity is $complexity but max allowed complexity is 20000. Please reduce the number of the fields in the query."))

  val exceptionHandler = ExceptionHandler {
    case (m, error: TooComplexQueryError) ⇒ HandledException(error.getMessage)
    case (m, NonFatal(error)) ⇒
      HandledException(error.getMessage)
  }

  def index = Action {
    Ok(views.html.index(gaCode))
  }

  def format = Action {
    Ok(views.html.workspace("GraphQL Formatter", "format", "formatter", gaCode))
  }

  def graphiql = Action {
    Ok(views.html.workspace("GraphiQL", "graphiql", "graphiql-workspace", gaCode))
  }

  def proxy = Action {
    Ok(views.html.workspace("GraphQL HTTP Proxy", "proxy", "proxy", gaCode))
  }

  def graphqlProxy = Action.async(parse.json) { request ⇒
    val query = (request.body \ "query").as[String]
    val schema = (request.body \ "schema").as[String]
    val operation = (request.body \ "operationName").asOpt[String]

    val variables = (request.body \ "variables").toOption.flatMap {
      case JsString(vars) ⇒ Some(parseVariables(vars))
      case obj: JsObject ⇒ Some(obj)
      case _ ⇒ None
    }

    materializeSchema(schema) flatMap {
      case Right(matSchema) ⇒
        executeQuery(matSchema, query, variables, operation)
      case Left(result) ⇒
        Future.successful(result)
    }
  }

  def proxyRequest = Action.async(parse.json) { request ⇒
    val url = (request.body \ "url").as[String]
    val rawHeaders = (request.body \ "headers").as[Seq[JsObject]]
    val removeFields = Set("url", "headers")
    val body = JsObject(request.body.asInstanceOf[JsObject].fields.filterNot(f ⇒ removeFields contains f._1))
    val headers = rawHeaders.map(o ⇒ (o \ "name").as[String] → (o \ "value").as[String])

    client.url(url).addHttpHeaders(headers: _*).post(body)
      .map { resp ⇒
        new Status(resp.status)(resp.json)
      }
  }

  private def materializeSchema(schemaDef: String): Future[Either[Result, (Schema[MatCtx, Any], MatCtx)]] = {
    QueryParser.parse(schemaDef) match {
      case Success(schemaAst) ⇒
        materializer.loadContext(schemaAst).map { ctx ⇒
          try {
            Right(Schema.buildFromAst(schemaAst, materializer.schemaBuilder(ctx).validateSchemaWithException(schemaAst)) → ctx)
          } catch {
            case e: SchemaMaterializationException ⇒
              Left(BadRequest(Json.obj("materializationError" → e.getMessage)))

            case NonFatal(error) ⇒
              Left(BadRequest(Json.obj("unexpectedError" → error.getMessage)))
          }
        }

      case Failure(error: SyntaxError) ⇒
        Future.successful(Left(BadRequest(Json.obj(
          "syntaxError" → error.getMessage,
          "locations" → Json.arr(Json.obj(
            "line" → error.originalError.position.line,
            "column" → error.originalError.position.column))))))
      case Failure(error) ⇒
        throw error
    }
  }

  private def parseVariables(variables: String) =
    if (variables.trim == "" || variables.trim == "null") Json.obj() else Json.parse(variables).as[JsObject]

  private def executeQuery(schemaAndRoot: (Schema[MatCtx, Any], MatCtx), query: String, variables: Option[JsObject], operation: Option[String]) =
    QueryParser.parse(query) match {

      // query parsed successfully, time to execute it!
      case Success(queryAst) ⇒
        val (schema, ctx) = schemaAndRoot

        Executor.execute(schema, queryAst,
          root = ctx.vars,
          userContext = ctx,
          operationName = operation,
          variables = variables getOrElse Json.obj(),
          exceptionHandler = exceptionHandler,
          queryReducers = complexityRejector :: Nil,
          maxQueryDepth = Some(15))
            .map(Ok(_))
            .recover {
              case error: QueryAnalysisError ⇒ BadRequest(error.resolveError)
              case error: ErrorWithResolver ⇒ InternalServerError(error.resolveError)
            }

      case Failure(error: SyntaxError) ⇒
        Future.successful(BadRequest(Json.obj(
          "syntaxError" → error.getMessage,
          "locations" → Json.arr(Json.obj(
            "line" → error.originalError.position.line,
            "column" → error.originalError.position.column)))))

      case Failure(error) ⇒
        throw error
    }

  def formatGet(query: String) = Action.async { request ⇒
    formatQuery(query)
  }

  def formatPost = Action.async(parse.text) { request ⇒
    formatQuery(request.body)
  }

  private def formatQuery(query: String) = {
    QueryParser.parse(query) match {
      case Success(ast) ⇒
        Future.successful(Ok(QueryRenderer.render(ast)))
      case Failure(error) ⇒
        Future.successful(BadRequest(error.getMessage))

    }
  }
}
