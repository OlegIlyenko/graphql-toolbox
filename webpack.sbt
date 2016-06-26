import play.sbt.PlayImport.PlayKeys._
import sbt.Keys._

playRunHooks <+= baseDirectory.map(Webpack.apply)

lazy val webpack = taskKey[Unit]("Run webpack when packaging the application")

def runWebpack(file: File) = {
  file.listFiles().foreach { f =>
    println("File! " + f)
  }

  Process("node_modules/.bin/webpack" + sys.props.get("os.name").filter(_.toLowerCase.contains("windows")).map(_ => ".cmd").getOrElse(""), file) !
}

webpack := {
  if(runWebpack(baseDirectory.value) != 0) throw new Exception("Something goes wrong when running webpack.")
}

dist <<= dist dependsOn webpack

stage <<= stage dependsOn webpack