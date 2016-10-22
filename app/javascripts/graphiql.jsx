import React from 'react';
import ReactDOM from 'react-dom';
import {GraphiQLTool} from './GraphiQLTool.jsx';
import {AppConfig} from './config';

import './css/graphiql.css'
import 'graphiql/graphiql.css'

module.exports = {
  bootstrap: function (bootstrapOptions = {}) {
    this.bootstrapOptions = bootstrapOptions;
    const config = new AppConfig("graphiql", bootstrapOptions);
    ReactDOM.render(<GraphiQLTool config={config} />, document.getElementById('graphiql-tool'));
  }
};
