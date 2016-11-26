import React, { PropTypes } from 'react';
import ReactDOM from 'react-dom';

import { SchemaEditor } from './SchemaEditor.jsx';
import CodeMirrorSizer from 'graphiql-workspace/dist/utility/CodeMirrorSizer';
import getQueryFacts from 'graphiql-workspace/dist/utility/getQueryFacts';
import getSelectedOperationName from 'graphiql-workspace/dist/utility/getSelectedOperationName';
import debounce from 'graphiql-workspace/dist/utility/debounce';
import find from 'graphiql-workspace/dist/utility/find';
import { fillLeafs } from 'graphiql-workspace/dist/utility/fillLeafs';
import { getLeft, getTop } from 'graphiql-workspace/dist/utility/elementPosition';
import { KeepLastTaskQueue } from 'graphiql-workspace';

import 'graphiql/graphiql.css'

export class GraphQLFormatter extends React.Component {
  static propTypes = {
    formatter: PropTypes.func.isRequired,
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
      editorFlex: 1,
    };

    this.taskQueue = new KeepLastTaskQueue()
  }

  componentDidMount() {
    // Utility for keeping CodeMirror correctly sized.
    this.codeMirrorSizer = new CodeMirrorSizer();

    this.handleFormat(this.state.query)
  }

  componentDidUpdate() {
    // If this update caused DOM nodes to have changed sizes, update the
    // corresponding CodeMirror instance sizes to match.
    this.codeMirrorSizer.updateSizes([
      this.queryEditorComponent,
      this.resultComponent,
    ]);
  }

  render() {
    const children = React.Children.toArray(this.props.children);

    const logo = find(children, child => child.type === GraphQLFormatter.Logo) ||
      <GraphQLFormatter.Logo />;

    const footer = find(children, child => child.type === GraphQLFormatter.Footer);

    const queryWrapStyle = {
      WebkitFlex: this.state.editorFlex,
      flex: this.state.editorFlex,
    };

    return (
      <div className="graphiql-container">
        <div className="editorWrap">
          <div className="topBarWrap">
            <div className="topBar">
              {logo}
            </div>
          </div>
          <div
            ref={n => { this.editorBarComponent = n; }}
            className="editorBar"
            onMouseDown={this.handleResizeStart}>
            <div className="queryWrap" style={queryWrapStyle}>
              <SchemaEditor
                ref={n => { this.queryEditorComponent = n; }}
                value={this.state.query}
                onEdit={this.handleEditQuery}
              />
            </div>

            <div className="resultWrap">
              <SchemaEditor
                ref={c => { this.resultComponent = c; }}
                value={this.state.response}
                readonly={true}
              />
              {footer}
            </div>
          </div>
        </div>
      </div>
    );
  }

  handleFormat = value => {
    const editedQuery = value || this.state.query;

    this.taskQueue.add(() => {
      return this._format(editedQuery).then(result => {
        this.setState({
          isWaitingForResponse: false,
          response: result,
        });
      })
    })

    // If an operation was explicitly provided, different from the current
    this.setState({
      isWaitingForResponse: true
    });
  }

  _format(query) {
    const formatter = this.props.formatter;
    const fetch = formatter(query);

    return fetch.catch(error => {
      this.setState({
        isWaitingForResponse: false,
        response: error && (error.stack || String(error))
      });
    });
  }

  handleEditQuery = value => {
    this.handleFormat(value)
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

      this.setState({ editorFlex: leftSize / rightSize });
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
    if (target.className.indexOf('CodeMirror-gutter') !== 0) {
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

GraphQLFormatter.Logo = function GraphiQLLogo(props) {
  return (
    <div className="title">
      {props.children || <span>GraphQL Formatter</span>}
    </div>
  );
};

// Configure the UI by providing this Component as a child of GraphiQL.
GraphQLFormatter.Footer = function GraphiQLFooter(props) {
  return (
    <div className="footer">
      {props.children}
    </div>
  );
};

const defaultQuery =
`type
  Query {
  		id(
    # foo bar
    arg: Int
  ): Int!
  # test

  #comment
  value:
  	String
}

#My schema



schema {
  	# foo

  #bar
  query: Query
}
`;