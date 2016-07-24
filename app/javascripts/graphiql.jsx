import React from 'react';
import ReactDOM from 'react-dom';
import {GraphiQLTool} from './GraphiQLTool.jsx';
import {AppConfig} from './config';

import './css/graphiql.css'
import 'graphiql/graphiql.css'

const config = new AppConfig("graphiql")

if (config.getTabs().length == 0) {
  config.addTab()
}

ReactDOM.render(<GraphiQLTool config={config} />, document.getElementById('graphiql-tool'));