package controllers

import play.api.libs.json._
import sangria.execution.{HandledException, Executor, QueryReducer}
import sangria.{schema, ast}
import sangria.ast.{ObjectTypeDefinition, TypeDefinition, FieldDefinition}
import sangria.schema._

import sangria.marshalling.MarshallingUtil._
import sangria.marshalling.playJson._
import sangria.marshalling.queryAst._

import scala.concurrent.Future
import scala.util.control.NonFatal

object Materializer {
  implicit class JsonOps(value: JsValue) {
    def get(key: String) = value match {
      case JsObject(fields) ⇒ fields.get(key)
      case _ ⇒ None
    }
    def apply(key: String) = get(key).get
    def stringValue = value.asInstanceOf[JsString].value
    def arrayValue = value.asInstanceOf[JsArray].value
    def booleanValue = value.asInstanceOf[JsBoolean].value
    def intValue = value.asInstanceOf[JsNumber].value.intValue
  }

  case class TooComplexQueryError(message: String) extends Exception(message)

  val complexityRejecor = QueryReducer.rejectComplexQueries(20000, (complexity: Double, _: Any) ⇒
    TooComplexQueryError(s"Query complexity is $complexity but max allowed complexity is 20000. Please reduce the number of the fields in the query."))

  val exceptionHandler: Executor.ExceptionHandler = {
    case (m, error: TooComplexQueryError) ⇒ HandledException(error.getMessage)
    case (m, NonFatal(error)) ⇒
//      error.printStackTrace()
      HandledException(error.getMessage)
  }

  private def directiveJsonArg(d: ast.Directive, name: String) =
    d.arguments.collectFirst {
      case ast.Argument(`name`, ast.StringValue(str, _, _), _, _) ⇒ Json.parse(str)
    }.getOrElse(throw new IllegalStateException(s"Can't find a directive argument $name"))

  private def directiveStringArg(d: ast.Directive, name: String) =
    d.arguments.collectFirst {
      case ast.Argument(`name`, ast.StringValue(str, _, _), _, _) ⇒ str
    }.getOrElse(throw new IllegalStateException(s"Can't find a directive argument $name"))

  private def directiveStringArgOpt(d: ast.Directive, name: String) =
    d.arguments.collectFirst {
      case ast.Argument(`name`, ast.StringValue(str, _, _), _, _) ⇒ str
    }

  private def directiveAstArg(d: ast.Directive, name: String) =
    d.arguments.collectFirst {
      case ast.Argument(`name`, ast, _, _) ⇒ ast
    }.getOrElse(throw new IllegalStateException(s"Can't find a directive argument $name"))


  private def extractCorrectValue(tpe: OutputType[_], value: Option[JsValue]): Any = tpe match {
    case OptionType(ofType) ⇒ Option(extractCorrectValue(ofType, value))
    case _ if value.isEmpty || value.get == JsNull ⇒ null
    case ListType(ofType) ⇒ value.get.arrayValue map (v ⇒ extractCorrectValue(ofType, Option(v)))
    case t: ScalarType[_] if t eq BooleanType ⇒ value.get.booleanValue
    case t: ScalarType[_] if t eq StringType ⇒ value.get.stringValue
    case t: ScalarType[_] if t eq IntType ⇒ value.get.intValue
    case t: CompositeType[_] ⇒ value.get
    case t ⇒ throw new IllegalStateException(s"Builder for type '$t' is not supported yet.")
  }

  val schemaBuilder: AstSchemaBuilder[Any] = new DefaultAstSchemaBuilder[Any] {

    val directiveMapping = Map[String, (ast.Directive, FieldDefinition) ⇒ Context[Any, _] ⇒ schema.Action[Any, _]](
      "jsonConst" → { (dir, _) ⇒
        val value = directiveJsonArg(dir, "value")

        c ⇒ extractCorrectValue(c.field.fieldType, Some(value))
      },

      "const" → { (dir, _) ⇒
        val value = directiveAstArg(dir, "value").convertMarshaled[JsValue]

        c ⇒ extractCorrectValue(c.field.fieldType, Some(value))
      },

      "field" → { (dir, _) ⇒
        directiveStringArgOpt(dir, "name") match {
          case Some(name) ⇒
            c ⇒ extractCorrectValue(c.field.fieldType, c.value.asInstanceOf[JsValue].get(name))
          case None ⇒
            directiveStringArgOpt(dir, "path") match {
              case Some(path) ⇒
                c ⇒ extractCorrectValue(c.field.fieldType, Some(JsonPath.query(path, c.value.asInstanceOf[JsValue])))
              case None ⇒
                throw new IllegalStateException(s"Can't find a directive argument 'path' or 'name'.")
            }
        }
      })

    override def resolveField(typeDefinition: TypeDefinition, definition: FieldDefinition) =
      definition.directives.find(d ⇒ directiveMapping contains d.name) match {
        case Some(dir) ⇒
          directiveMapping(dir.name)(dir, definition)
        case None ⇒
          c ⇒ {
            extractCorrectValue(c.field.fieldType, c.value.asInstanceOf[JsValue].get(definition.name))
          }
      }

    override def objectTypeInstanceCheck(definition: ObjectTypeDefinition, extensions: List[ast.TypeExtensionDefinition]) =
      Some((value, _) ⇒ value.asInstanceOf[JsObject].fields.filter(_._1 == "type").exists(_._2.asInstanceOf[JsString].value == definition.name))
  }
}
