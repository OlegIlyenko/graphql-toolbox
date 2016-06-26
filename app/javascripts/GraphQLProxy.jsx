import React, { PropTypes } from 'react';
import ReactDOM from 'react-dom';

import { SchemaEditor } from './SchemaEditor.jsx';
import GraphiQL from 'graphiql';
import CodeMirrorSizer from './utility/CodeMirrorSizer';
import getQueryFacts from './utility/getQueryFacts';
import getSelectedOperationName from './utility/getSelectedOperationName';
import debounce from './utility/debounce';
import find from './utility/find';
import { fillLeafs } from './utility/fillLeafs';
import { getLeft, getTop } from './utility/elementPosition';
import { KeepLastTaskQueue } from './KeepLastTaskQueue';

import Modal from 'react-bootstrap/lib/Modal';
import Button from 'react-bootstrap/lib/Button';

import {
  introspectionQuery
} from './utility/introspectionQueries';

import {
  buildClientSchema,
  GraphQLSchema,
  parse,
  print,
} from 'graphql';

import 'graphiql/graphiql.css'

export class GraphQLProxy extends React.Component {
  static propTypes = {
    value: PropTypes.string,
  }

  constructor(props) {
    super(props);

    // Determine the initial query to display.
    const query =
      props.query !== undefined ? props.value : defaultQuery;

    // Initialize state
    this.state = {
      query,
      editorFlex: 0.4,
    };

    this.taskQueue = new KeepLastTaskQueue()
  }

  componentDidMount() {
    // Utility for keeping CodeMirror correctly sized.
    this.codeMirrorSizer = new CodeMirrorSizer();

    //this.handleFormat(this.state.query)
  }

  componentDidUpdate() {
    // If this update caused DOM nodes to have changed sizes, update the
    // corresponding CodeMirror instance sizes to match.
    this.codeMirrorSizer.updateSizes([
      this.queryEditorComponent,
      //this.resultComponent,
    ]);
  }

  render() {
    const children = React.Children.toArray(this.props.children);

    const queryWrapStyle = {
      WebkitFlex: this.state.editorFlex,
      flex: this.state.editorFlex,
    };

    return (
      <div className="proxyWrap" ref={n => { this.editorBarComponent = n; }}>
        <div className="proxyWrapLeft" style={queryWrapStyle}>
          <div className="topBarWrap">
            <div className="topBar">
              <div className="title">
                <span>Schema Editor (<a href="#" onClick={this.help.bind(this)}>help</a>)</span>
              </div>
            </div>
          </div>
          <SchemaEditor
            ref={n => { this.queryEditorComponent = n; }}
            value={this.state.query}
            onEdit={this.handleEditQuery}
          />
          {this.state.error &&
            <div className="error"><pre>{this.state.error}</pre></div>}
        </div>
        <div className="proxyWrapRight" onMouseDown={this.handleResizeStart}>
          <GraphiQL
            ref={c => { this.resultComponent = c; }}
            fetcher = {this.fetcher.bind(this)}
            schema = {this.state.schema}
            defaultQuery = {defaultGraphiqlQuery}
          />
        </div>

        <Modal show={this.state.showHelp} onHide={this.helpHide.bind(this)} bsSize="large" aria-labelledby="contained-modal-title-base">
          <Modal.Header closeButton>
            <Modal.Title id="contained-modal-title-base">Schema Definition Help</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>TODO</p>
          </Modal.Body>
          <Modal.Footer>
            <Button onClick={this.helpHide.bind(this)}>Close</Button>
          </Modal.Footer>
        </Modal>
      </div>
    );
  }

  helpHide() {
    this.setState({showHelp: false})
  }

  help(e) {
    e.preventDefault()
    this.setState({showHelp: true})
  }

  fetcher(params) {
    if (!params.schema)
      params.schema = this.state.query

    return fetch('/graphql-proxy', {
      method: 'post',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
      credentials: 'include',
    }).then(function (response) {
      return response.text();
    }).then(function (responseBody) {
      try {
        return JSON.parse(responseBody);
      } catch (error) {
        return responseBody;
      }
    });
  }

  handleEditQuery = value => {
    this.taskQueue.add(() => {
      return this.updateSchema(value)
    })
  }

  updateSchema(schema) {
    const fetch = this.fetcher({query: introspectionQuery, schema});

    return fetch.then(result => {
      if (result && result.data) {
        this.setState({query: schema, schema: buildClientSchema(result.data), error: null});
      } else {
        var responseString = typeof result === 'string' ?
          result :
          JSON.stringify(result, null, 2);

        if (result.materiamlizationError) {
          responseString = result.materiamlizationError
        } else if (result.syntaxError) {
          responseString = result.syntaxError
        } else if (result.unexpectedError) {
          responseString = result.unexpectedError
        }

        this.setState({ error: responseString });
      }
    }).catch(error => {
      // TODO: handle error!
      this.setState({ error: error && (error.stack || String(error)) });
    });
  }

  handleResizeStart = downEvent => {
    if (!this._didClickDragBar(downEvent)) {
      return;
    }

    downEvent.preventDefault();

    const offset = downEvent.clientX - getLeft(downEvent.target);

    let onMouseMove = moveEvent => {
      if (moveEvent.buttons === 0) {
        return onMouseUp();
      }

      const editorBar = ReactDOM.findDOMNode(this.editorBarComponent);
      const leftSize = moveEvent.clientX - getLeft(editorBar) - offset;
      const rightSize = editorBar.clientWidth - leftSize;

      this.setState({ editorFlex: (leftSize / rightSize) });
    };

    let onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      onMouseMove = null;
      onMouseUp = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  _didClickDragBar(event) {
    // Only for primary unmodified clicks
    if (event.button !== 0 || event.ctrlKey) {
      return false;
    }
    let target = event.target;

    // We use codemirror's gutter as the drag bar.
    // `CodeMirror-linenumbers` tells us that it's a left pane (only left pane has line numbers)
    if (target.className.indexOf('CodeMirror-gutter') < 0 || target.className.indexOf('CodeMirror-linenumbers') < 0) {
      return false;
    }
    // Specifically the result window's drag bar.
    const resultWindow = ReactDOM.findDOMNode(this.resultComponent);
    while (target) {
      if (target === resultWindow) {
        return true;
      }
      target = target.parentNode;
    }
    return false;
  }
}

const defaultQuery =
`type Film {
  title: String
}

type Person {
  name: String
  size: Int @value(name: "height")
  homeworld: Planet @httpGet(url: "\${value.homeworld}")
}

## A planet from the StarWars universe
type Planet {
  name: String
}

## The root query type
type Query {
	## A character from the StarWars
  person(id: Int!): Person
  	@httpGet(url: "http://swapi.co/api/people/\${arg.id}")

  ## A list of characters from the StarWars
  people(page: Int): [Person]
  	@httpGet(url: "http://swapi.co/api/people", query: {page: "\${arg.page}"})
  	@value(name: "results")

  ## A character from the StarWars
  film(id: Int!): Film
  	@httpGet(url: "http://swapi.co/api/films/\${arg.id}")

  ## A list of characters from the StarWars
  films(page: Int): [Film]
  	@httpGet(url: "http://swapi.co/api/films", query: {page: "\${arg.page}"})
  	@value(name: "results")
}

schema {
  query: Query
}`;

const defaultGraphiqlQuery =
`query {
  person(id: 1) {
    name
    size
    homeworld {
      name
    }
  }

  films {
    title
  }
}`