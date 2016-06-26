package controllers

import play.api.libs.json._

import io.gatling.jsonpath.{JsonPath ⇒ GatlingJsonPath, _}
import io.gatling.jsonpath.AST._
import scala.util.Try

// copy/pasted from https://github.com/josephpconley/play-jsonpath/blob/master/src/main/scala/com/josephpconley/jsonpath/JSONPath.scala
// it was not updated anymore so it needs to be recompiled
object JsonPath {
  private val parser = new Parser

  private def error(msg: String = "") = throw new Exception("Bad JSONPath query " + msg)

  def compile(q: String) = Try(parser.compile(q)).isSuccess

  def query(q: String, js: JsValue): JsValue = {
    val tokens = parser.compile(q).getOrElse(error())
    parse(tokens, js)
  }

  def parse(tokens: List[PathToken], js: JsValue): JsValue = tokens.foldLeft[JsValue](js)( (js, token) => token match {
    case Field(name) => js match {
      case JsObject(fields) => fields.find(_._1 == name).map(_._2).getOrElse(error("Couldn't find field"))
      case JsArray(arr) => JsArray(arr.map(obj => (obj \ name).asOpt[JsValue].getOrElse(error())))
      case _ => error()
    }
    case RecursiveField(name) => js match {
      case JsObject(fields) => {
        var value = js \\ name
        if(value.head.isInstanceOf[JsArray]){
          value = value.flatMap(_.as[JsArray].value)
        }
        JsArray(value)
      }
      case JsArray(arr) => {
        var value = arr.flatMap(_ \\ name)
        if(value.head.isInstanceOf[JsArray]){
          value = value.flatMap(_.as[JsArray].value)
        }
        JsArray(value)
      }
      case _ => error()
    }
    case MultiField(names) => js match {
      case JsObject(fields) => JsArray(fields.filter(f => names.contains(f._1)).map(_._2).toSeq)
      case _ => error()
    }
    case AnyField => js match {
      case JsObject(fields) => JsArray(fields.map(_._2).toSeq)
      case JsArray(arr) => js
      case _ => error()
    }
    case RecursiveAnyField => js
    case ArraySlice(start, stop, step) =>
      js.asOpt[JsArray].map { arr =>
        var sliced = if(start.getOrElse(0) >= 0) arr.value.drop(start.getOrElse(0)) else arr.value.takeRight(Math.abs(start.get))
        sliced = if(stop.getOrElse(arr.value.size) >= 0) sliced.slice(0, stop.getOrElse(arr.value.size)) else sliced.dropRight(Math.abs(stop.get))

        if(step < 0){
          sliced = sliced.reverse
        }
        JsArray(sliced.zipWithIndex.filter(_._2 % Math.abs(step) == 0).map(_._1))
      }.getOrElse(error())
    case ArrayRandomAccess(indices) => {
      val arr = js.as[JsArray].value
      val selectedIndices = indices.map(i => if(i >= 0) i else arr.size + i).toSet.toSeq
      //      println(selectedIndices + " " + js)

      if(selectedIndices.size == 1) arr(selectedIndices.head) else JsArray(selectedIndices.map(arr(_)))
    }
    case ft: FilterToken => JsArray(parseFilterToken(ft, js))
    case _ => js
  })

  private def parseFilterToken(ft: FilterToken, js: JsValue): Seq[JsValue] = ft match {
    case HasFilter(SubQuery(tokens)) =>
      (for{
        arr <- js.asOpt[JsArray]
        objs <- Try(arr.value.map(_.as[JsObject])).toOption
      } yield {
        tokens.last match {
          case Field(name) => objs.filter(_.keys.contains(name))
          case MultiField(names) => objs.filter(_.keys.intersect(names.toSet) == names.toSet)
          case _ => error()
        }
      }).getOrElse(error())
    case ComparisonFilter(op, lhv, rhv) => {
      js.asOpt[JsArray].map { arr =>
        arr.value.filter{obj =>
          val left = parseFilterValue(lhv, obj)
          val right = parseFilterValue(rhv, obj)
          op.apply(left, right)
        }
      }.getOrElse(error())
    }
    case BooleanFilter(binOp, lht, rht) => {
      val leftJs = parseFilterToken(lht, js)
      val rightJs = parseFilterToken(rht, js)

      binOp match {
        case OrOperator => leftJs.union(rightJs).toSet.toSeq
        case AndOperator => leftJs.intersect(rightJs)
      }
    }
  }

  private def parseFilterValue(fv: FilterValue, js: JsValue): Any = fv match {
    case SubQuery(tokens) => Try{
      primitive(parse(tokens, js)) match {
        case n:Number => n.doubleValue()
        case a @ _ => a
      }
    }.getOrElse(error())
    case dv: FilterDirectValue => dv.value
  }

  def primitive(js: JsValue): Any = js match {
    case JsNumber(n) => n
    case JsString(s) => s
    case JsBoolean(b) => b
    case _ => throw new Exception("Not a JsPrimitive: " + js)
  }
}
