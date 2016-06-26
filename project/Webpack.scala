import java.net.InetSocketAddress

import play.sbt.PlayRunHook
import sbt._

object Webpack {
  def apply(base: File): PlayRunHook = {
    object WebpackHook extends PlayRunHook {
      var process: Option[Process] = None

      override def beforeStarted() = {
        process = Option(
          Process("node_modules/.bin/webpack" + sys.props.get("os.name").filter(_.toLowerCase.contains("windows")).map(_ => ".cmd").getOrElse(""), base).run()
        )
      }

      override def afterStarted(addr: InetSocketAddress) = {
        process = Option(
          Process("node_modules/.bin/webpack" + sys.props.get("os.name").filter(_.toLowerCase.contains("windows")).map(_ => ".cmd").getOrElse("") + " --watch", base).run()
        )
      }

      override def afterStopped() = {
        process.foreach(_.destroy())
        process = None
      }
    }

    WebpackHook
  }
}