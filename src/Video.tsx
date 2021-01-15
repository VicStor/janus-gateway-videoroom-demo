/* eslint-disable @typescript-eslint/no-empty-interface */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { Component } from 'react';

interface VideoProps {
  id: string;
  muted: boolean;
  style: any;
  stream: any;
}

interface VideoState {}

export default class Video extends Component<VideoProps, VideoState> {
  video: any;
  container: any;

  constructor(props) {
    super(props);
  }

  componentDidMount() {
    this.video.srcObject = this.props.stream;
    this.video.play();
  }

  // eslint-disable-next-line react/no-deprecated
  componentWillReceiveProps(nextProps) {
    if (nextProps.stream !== this.props.stream) {
      this.video.srcObject = nextProps.stream;
      this.video.play();
    }
  }

  render() {
    const { id, muted, style } = this.props;

    return (
      <video
        id={`video-${id}`}
        muted={muted}
        style={style}
        ref={(video) => {
          this.video = video;
        }}
      />
    );
  }
}
