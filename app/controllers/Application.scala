package controllers

import javax.inject.Inject

import akka.actor.ActorSystem
import play.api.mvc._
import play.api.Configuration

import sangria.parser.QueryParser

import sangria.renderer.QueryRenderer

import scala.concurrent.Future
import scala.util.{Failure, Success}

class Application @Inject()(system: ActorSystem, config: Configuration) extends Controller {
  import system.dispatcher

  val gaCode = config.getString("gaCode")
  val defaultGraphQLUrl = config.getString("defaultGraphQLUrl").getOrElse(s"http://localhost:${config.getInt("http.port").getOrElse(9000)}")+"/graphql"

  def index = Action {
    Ok(views.html.index(gaCode,defaultGraphQLUrl))
  }

  def format = Action {
    Ok(views.html.format(gaCode))
  }

  def formatGet(query: String) = Action.async { request =>
    formatQuery(query)
  }

  def formatPost = Action.async(parse.text) { request =>
    formatQuery(request.body)
  }

  private def formatQuery(query: String) = {
    QueryParser.parse(query) match {
      case Success(ast) =>
        Future.successful(Ok(QueryRenderer.render(ast)))
      case Failure(error) =>
        Future.successful(BadRequest(error.getMessage))

    }
  }
}
