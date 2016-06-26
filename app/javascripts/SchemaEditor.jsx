import React, { PropTypes } from 'react';
import ReactDOM from 'react-dom';
import CodeMirror from 'codemirror';

import 'codemirror/addon/hint/show-hint';
import 'codemirror/addon/comment/comment';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/brace-fold';
import 'codemirror/addon/lint/lint';
import 'codemirror/keymap/sublime';
import 'codemirror-graphql/hint';
import 'codemirror-graphql/lint';
import 'codemirror-graphql/mode';

import 'codemirror/lib/codemirror.css'
import 'graphiql/graphiql.css'
import './css/SchemaEditor.css'

export class SchemaEditor extends React.Component {
  static propTypes = {
    value: PropTypes.string,
    onEdit: PropTypes.func,
    readonly: PropTypes.bool
  }

  constructor(props) {
    super();

    // Keep a cached version of the value, this cache will be updated when the
    // editor is updated, which can later be used to protect the editor from
    // unnecessary updates during the update lifecycle.
    this.cachedValue = props.value || '';
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !!this.props.readonly; // do not disturb the editor
  }

  componentDidMount() {
    this.editor = CodeMirror(ReactDOM.findDOMNode(this), {
      value: this.props.value || '',
      readOnly: this.props.readonly || false,
      lineWrapping: this.props.readonly || false,
      lineNumbers: true,
      tabSize: 2,
      mode: 'graphql',
      theme: 'graphiql',
      keyMap: 'sublime',
      autoCloseBrackets: true,
      matchBrackets: true,
      showCursorWhenSelecting: true,
      foldGutter: {
        minFoldSize: 4
      },
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      extraKeys: {
        'Cmd-Space': () => this.editor.showHint({completeSingle: true}),
        'Ctrl-Space': () => this.editor.showHint({completeSingle: true}),
        'Alt-Space': () => this.editor.showHint({completeSingle: true}),
        'Shift-Space': () => this.editor.showHint({completeSingle: true}),

        // Editor improvements
        'Ctrl-Left': 'goSubwordLeft',
        'Ctrl-Right': 'goSubwordRight',
        'Alt-Left': 'goGroupLeft',
        'Alt-Right': 'goGroupRight',
      }
    });

    this.editor.on('change', this._onEdit);
    this.editor.on('keyup', this._onKeyUp);
  }

  componentDidUpdate(prevProps) {
    // Ensure the changes caused by this update are not interpretted as
    // user-input changes which could otherwise result in an infinite
    // event loop.
    this.ignoreChangeEvent = true;

    if (this.props.value !== prevProps.value && this.props.value !== this.cachedValue) {
      this.cachedValue = this.props.value;
      this.editor.setValue(this.props.value);
    }

    this.ignoreChangeEvent = false;
  }

  componentWillUnmount() {
    this.editor.off('change', this._onEdit);
    this.editor.off('keyup', this._onKeyUp);
    this.editor = null;
  }

  render() {
    return <div className="query-editor" />;
  }

  /**
   * Public API for retrieving the CodeMirror instance from this
   * React component.
   */
  getCodeMirror() {
    return this.editor;
  }

  _onKeyUp = (cm, event) => {
    const code = event.keyCode;
    if (
      (code >= 65 && code <= 90) || // letters
      (!event.shiftKey && code >= 48 && code <= 57) || // numbers
      (event.shiftKey && code === 189) || // underscore
      (event.shiftKey && code === 50) || // @
      (event.shiftKey && code === 57) // (
    ) {
      this.editor.execCommand('autocomplete');
    }
  }

  _onEdit = () => {
    if (!this.ignoreChangeEvent) {
      this.cachedValue = this.editor.getValue();
      if (this.props.onEdit) {
        this.props.onEdit(this.cachedValue);
      }
    }
  }
}