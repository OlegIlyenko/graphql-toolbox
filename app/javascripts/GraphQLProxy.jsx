import React, { PropTypes } from 'react';
import ReactDOM from 'react-dom';

import { SchemaEditor } from './SchemaEditor.jsx';
import GraphiQL from 'graphiql';
import CodeMirrorSizer from 'graphiql-workspace/dist/utility/CodeMirrorSizer';
import getQueryFacts from 'graphiql-workspace/dist/utility/getQueryFacts';
import getSelectedOperationName from 'graphiql-workspace/dist/utility/getSelectedOperationName';
import debounce from 'graphiql-workspace/dist/utility/debounce';
import find from 'graphiql-workspace/dist/utility/find';
import { fillLeafs } from 'graphiql-workspace/dist/utility/fillLeafs';
import { getLeft, getTop } from 'graphiql-workspace/dist/utility/elementPosition';
import { KeepLastTaskQueue } from 'graphiql-workspace';

import Modal from 'react-bootstrap/lib/Modal';
import Button from 'react-bootstrap/lib/Button';

import {
  introspectionQuery
} from 'graphiql-workspace/dist/utility/introspectionQueries';

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
            <p>
              Schema definition is based on <a href="https://github.com/facebook/graphql/pull/90" target="_blank">GraphQL IDL additions</a>.
              IDL syntax allows you to define full GraphQL schema with interfaces, types, enums etc.
              In order to provide resolution logic for the fields, you can use directives described below.
              Directives will define how fields will behave. By default (if no directive is provided),
              field resolve function will treat a contextual value as a JSON object and will return it's
              property with the same name.
            </p>

            <h3>Directives</h3>

            <pre>
              directive @httpGet(url: String!, headers: ObjectOrList, query: ObjectOrList, forAll: String) on FIELD_DEFINITION
            </pre>

            <p>
              Provides a way to resolve the field with a result of a GET HTTP request.<br/><br/>
              Supports following arguments:
            </p>

            <ul>
              <li><code>url</code> - the URL of an HTTP request</li>
              <li>
                <code>headers</code> - headers that should be sent with the request.
                The value can be either an input object (e.g <code>{`{Authorization: "Bearer FOOBARBAZ"}`}</code>)
                or a list with name-value pairs (e.g. <code>[{`{name: "Authorization", value: "Bearer FOOBARBAZ"}`}]</code>)
              </li>
              <li>
                <code>query</code> - query string parameters that should be sent with the request.
                The value can be either an input object (e.g <code>{`{limit: 10, offset: 0}`}</code>)
                or a list with name-value pairs (e.g. <code>[{`{name: "page-number", value: "1"}`}]</code>)
              </li>
              <li>
                <code>forAll</code> - A <a href="http://goessner.net/articles/JsonPath/" target="_blank">JSON Path</a> expression. For every element,
                returned by this expression executed against current context value,
                a separate HTTP request would be sent. An <code>elem</code> placeholder
                scope may be used in combination with this argument.
              </li>
            </ul>

            <p>
              <code>url</code>, <code>headers</code> and <code>query</code> may contain the placeholders which are described below.
              <code>value</code> directive may be used in combination with <code>httpGet</code> - it will extract part of the relevant JSON out of the HTTP response.
            </p>

            <pre>
              directive @const(value: Any!) on FIELD_DEFINITION | SCHEMA
            </pre>

            <p>
              Provides a way to resolve a field with a constant value.
              <code>value</code> can be any valid GraphQL input value. It would be treated as a JSON value.
            </p>

            <pre>
              directive @jsonConst(value: String!) on FIELD_DEFINITION | SCHEMA
            </pre>

            <p>
              Provides a way to resolve a field with a constant value.
              <code>value</code> should be a valid JSON value.
            </p>

            <pre>
              directive @arg(name: String!) on FIELD_DEFINITION
            </pre>

            <p>
              Provides a way to resolve a field with value of one of its arguments.
            </p>

            <pre>
              directive @value(name: String, path: String) on FIELD_DEFINITION
            </pre>

            <p>
              Extracts a value(s) from the context object. It supports following extractors via arguments (only one can be used):
            </p>

            <ul>
              <li><code>name</code> - Extracts a named property value from a context JSON object</li>
              <li><code>path</code> - A <a href="http://goessner.net/articles/JsonPath/" target="_blank">JSON Path</a> expression. It would be executed against current context JSON value.</li>
            </ul>

            <pre>
              directive @context(name: String, path: String) on FIELD_DEFINITION
            </pre>

            <p>
              Extracts a value(s) from the context object defined on the schema level. It supports following extractors via arguments (only one can be used):
            </p>

            <ul>
              <li><code>name</code> - Extracts a named property value from a JSON object</li>
              <li><code>path</code> - A <a href="http://goessner.net/articles/JsonPath/" target="_blank">JSON Path</a> expression. It would be executed against current context JSON value, which is defined at the schema level.</li>
            </ul>

            <h3>Placeholders</h3>

            <p>Placeholders may be used in some the directive arguments (inside of the strings) and the syntax looks like this:</p>

            <pre>
              {`\${value.$.results[0].film}`}
            </pre>

            <p>
              The placeholder consists of two parts separated by dot (<code>.</code>): the scope (<code>value</code> in this case) and
              the extractor (<code>$.results[0].film</code> - a JSON Path extractor in this example).
              The scope defines a place/value from which you would like extract a value. Following scopes are supported:
            </p>

            <ul>
              <li><code>arg</code> - field argument</li>
              <li><code>value</code> - a context value</li>
              <li><code>ctx</code> - a context value which is defined on a schema level</li>
              <li><code>elem</code> - an extracted element that comes from the <code>forAll</code> argument</li>
            </ul>

            <p>
              The extractor can be either a string (the name of the property) or a <a href="http://goessner.net/articles/JsonPath/" target="_blank">JSON Path</a> expression.
            </p>

            <h3>Descriptions</h3>

            <p>
              All elements of a schema (like types, fields, arguments, etc.)
              support descriptions. Here is an example:
            </p>

            <pre><code>{
`"""
The root query type.
"""
type Query {
  "A character from the StarWars"
  person(
    "ID of a character"
    id: Int!): Person
}`
            }</code></pre>
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
`# It's an example schema
# that proxies some poarets of the http://swapi.co
schema
  @includeGraphQL(schemas: [{
    name: "starWars" 
    url: "http://try.sangria-graphql.org/graphql"
  }, {
    name: "universe" 
    url: "https://www.universe.com/graphql/beta"
  }]) {
    
  query: Query
}

"""
The root query type.
"""
type Query 
  @include(fields: [
    {schema: "starWars", type: "Query"} 
    {schema: "universe", type: "Query"}
  ]) {
	
	"A character from the StarWars (REST API)"
  person(id: Int!): Person
  	@httpGet(url: "http://swapi.co/api/people/\${arg.id}")

  "A list of characters from the StarWars (REST API)"
  people(page: Int): [Person]
  	@httpGet(
  	  url: "http://swapi.co/api/people" 
  	  query: {name: "page", value: "\${arg.page}"})
  	@value(name: "results")
}

type Film {
  title: String
}

type Person {
  name: String
  size: Int @value(name: "height")
  homeworld: Planet @httpGet(url: "\${value.homeworld}")
  films: [Film] @httpGet(forAll: "$.films", url: "\${elem.$}")
}

"A planet from the StarWars universe"
type Planet {
  name: String
}`;

const defaultGraphiqlQuery =
`query {
  person(id: 1) {
    name
    size

    homeworld {
      name
    }

    films {
      title
    }
  }
}`