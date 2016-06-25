import React from 'react';
import ReactDOM from 'react-dom';
import {GraphQLFormatter} from './GraphQLFormatter.jsx';

import './css/format.css'

function formatter(value) {
  return fetch('/format-query', {
    method: 'post',
    headers: {
      'Accept': 'text/plain',
      'Content-Type': 'text/plain',
    },
    body: value,
    credentials: 'include',
  }).then(function (response) {
    return response.text();
  });
}

ReactDOM.render(<GraphQLFormatter formatter={formatter} />, document.getElementById('formatter'));