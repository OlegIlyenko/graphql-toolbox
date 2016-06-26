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

    const logo = find(children, child => child.type === GraphQLFormatter.Logo) ||
      <GraphQLProxy.Logo />;

    const footer = find(children, child => child.type === GraphQLFormatter.Footer);

    const queryWrapStyle = {
      WebkitFlex: this.state.editorFlex,
      flex: this.state.editorFlex,
    };

    return (
      <div className="proxyWrap" ref={n => { this.editorBarComponent = n; }}>
        <div className="proxyWrapLeft" style={queryWrapStyle}>
          <div className="topBarWrap">
            <div className="topBar">
              {logo}
            </div>
          </div>
          <SchemaEditor
            ref={n => { this.queryEditorComponent = n; }}
            value={this.state.query}
            onEdit={this.handleEditQuery}
          />
        </div>
        <div className="proxyWrapRight" onMouseDown={this.handleResizeStart}>
          <GraphiQL
            ref={c => { this.resultComponent = c; }}
            fetcher = {this.fetcher}
          />
        </div>

      </div>
    );
  }

  fetcher() {

  }

  handleEditQuery = value => {
    console.info(value)
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

GraphQLProxy.Logo = function GraphiQLLogo(props) {
  return (
    <div className="title">
      {props.children || <span>Schema Editor</span>}
    </div>
  );
};

// Configure the UI by providing this Component as a child of GraphiQL.
GraphQLProxy.Footer = function GraphiQLFooter(props) {
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