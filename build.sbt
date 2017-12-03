name := "graphql-toolbox"
description := "GraphQL Toolbox"

version := "1.0-SNAPSHOT"

scalaVersion := "2.12.3"

libraryDependencies ++= Seq(
  guice,
  ws,
  filters,
  "org.sangria-graphql" %% "sangria" % "1.3.3",
  "org.sangria-graphql" %% "sangria-play-json" % "1.0.3",
  "io.gatling" %% "jsonpath" % "0.6.9"
)

resolvers += "scalaz-bintray" at "http://dl.bintray.com/scalaz/releases"
resolvers += "Sonatype snapshots" at "https://oss.sonatype.org/content/repositories/snapshots/"

routesGenerator := InjectedRoutesGenerator

lazy val root = (project in file(".")).enablePlugins(PlayScala)

herokuAppName in Compile := "graphql-toolbox"