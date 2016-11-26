import React from 'react';
import ReactDOM from 'react-dom';
import {GraphiQLWorkspace, AppConfig} from 'graphiql-workspace';

import 'graphiql-workspace/graphiql-workspace.css'
import 'graphiql/graphiql.css'

module.exports.setupGraphiQLWorkspace = function (bootstrapOptions = {}) {
  this.bootstrapOptions = bootstrapOptions;
  const config = new AppConfig("graphiql", bootstrapOptions);
  ReactDOM.render(<GraphiQLWorkspace config={config} proxyUrl={"/proxy-graphql-request"} />, document.getElementById('graphiql-workspace'));
}
