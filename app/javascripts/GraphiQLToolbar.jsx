import React, {PropTypes} from 'react';

import Button from 'react-bootstrap/lib/Button';
import Glyphicon from 'react-bootstrap/lib/Glyphicon';
import OverlayTrigger from 'react-bootstrap/lib/OverlayTrigger';
import Tooltip from 'react-bootstrap/lib/Tooltip';

import Dropzone from 'react-dropzone'

export class GraphiQLToolbar extends React.Component {
  static propTypes = {
    onToolbar: PropTypes.func,
    hasClosed: PropTypes.bool.isRequired
  }

  render() {
    const reopenTooltip = <Tooltip id="tooltip"><strong>Reopen closed tab</strong></Tooltip>
    const exportTooltip = <Tooltip id="tooltip"><strong>Save workspace</strong></Tooltip>
    const restoreTooltip = <Tooltip id="tooltip"><strong>Open workspace</strong> (drag&drop file here or just click the icon)</Tooltip>
    const cleanTooltip = <Tooltip id="tooltip"><strong>Cleanup the workspace and start from scratch</strong></Tooltip>
    const placement = "left"

    return <div className="graphiql-toolbar">
      {this.props.hasClosed &&
        <span>
          <OverlayTrigger placement={placement} overlay={reopenTooltip}>
            <Button bsStyle="link" bsSize="large" onClick={this.action.bind(this, "reopen")}><Glyphicon glyph="share-alt" /></Button>
          </OverlayTrigger><br/>
        </span>
      }
      <OverlayTrigger placement={placement} overlay={exportTooltip}>
        <Button bsStyle="link" bsSize="large" onClick={this.action.bind(this, "export")}><Glyphicon glyph="save" /></Button>
      </OverlayTrigger><br/>

      <Dropzone onDrop={this.onDrop.bind(this)} multiple={false} className="dropzone" activeClassName="dropzone-active">
        <OverlayTrigger placement={placement} overlay={restoreTooltip}>
          <Button bsStyle="link" bsSize="large"><Glyphicon glyph="open" /></Button>
        </OverlayTrigger>
      </Dropzone>

      <span>
        <OverlayTrigger placement={placement} overlay={cleanTooltip}>
          <Button bsStyle="link" bsSize="large" onClick={this.action.bind(this, "clean")}><Glyphicon glyph="trash" /></Button>
        </OverlayTrigger>
      </span>
    </div>
  }

  onDrop(files) {
    const file = files[0]
    const reader = new FileReader();

    reader.onload = (e) => {
      this.action("restore", JSON.parse(e.target.result))
    }

    reader.readAsText(file)
  }

  action(action, arg) {
    if (this.props.onToolbar)
      this.props.onToolbar(action, arg)
  }
}