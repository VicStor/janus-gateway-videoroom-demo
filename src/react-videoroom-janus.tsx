/* eslint-disable @typescript-eslint/no-empty-interface */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { Component, Fragment } from 'react';
import { Subscription, from, Subject } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { JanusClient } from './janus-gateway-client';
import Video from './Video';

interface CustomStyles {
  video?: any;
  container?: any;
  videoContainer?: any;
  localVideo?: any;
  localVideoContainer?: any;
}

interface JanusVideoRoomProps {
  server: string;
  room: string;
  user_id: string;
  onRooms: (rooms: any[]) => void;
  onError: (error: any) => void;
  onConnected?: (publisher: any) => void;
  onDisconnected?: (error?: any) => void;
  onPublisherDisconnected?: (publisher: any) => void;
  onParticipantJoined?: (participant: any) => void;
  onParticipantLeft?: (participant: any) => void;
  renderContainer?: (children: any) => any;
  renderStream?: (subscriber: any) => any;
  renderLocalStream?: (publisher: any) => any;
  getCustomStyles?: (nParticipants: number) => CustomStyles;
  logger?: any;
  rtcConfiguration?: any;
  cameraId?: string;
  mediaConstraints?: any;
}

interface JanusVideoRoomState {
  styles: CustomStyles;
}

export class JanusVideoRoom extends Component<JanusVideoRoomProps, JanusVideoRoomState> {
  client: any;
  logger: any;
  connected: boolean;
  defaultStyles: any;
  loggerEnabled: boolean;
  nParticipants: number;
  tasks: Subject<any>;
  s: Subscription;

  constructor(props) {
    super(props);

    this.loggerEnabled = true;

    let customStyles = {};

    if (this.props.getCustomStyles) {
      customStyles = this.props.getCustomStyles(0);
    }

    this.defaultStyles = {
      container: {
        height: `100%`,
        width: `100%`,
        position: `relative`,
      },
      video: {
        width: `100%`,
      },
      videoContainer: {
        width: `100%`,
        height: `100%`,
      },
      localVideo: {
        width: `200px`,
        height: `auto`,
      },
      localVideoContainer: {
        position: `absolute`,
        top: `50px`,
        right: `50px`,
      },
    };

    this.state = {
      styles: {
        ...this.defaultStyles,
        ...customStyles,
      },
    };

    this.tasks = new Subject();

    this.logger = {
      enable: () => {
        this.loggerEnabled = true;
      },
      disable: () => {
        this.loggerEnabled = false;
      },
      success: (...args) => {
        if (this.loggerEnabled) {
          if (this.props.logger && this.props.logger.success) {
            this.props.logger.success(...args);
          } else {
            console.log(...args);
          }
        }
      },
      info: (...args) => {
        if (this.loggerEnabled) {
          if (this.props.logger && this.props.logger.info) {
            this.props.logger.info(...args);
          } else {
            console.log(...args);
          }
        }
      },
      error: (error: any) => {
        if (this.loggerEnabled) {
          if (this.props.logger && this.props.logger.error) {
            this.props.logger.error(error);
          } else {
            console.error(error);
          }
        }
      },
      json: (...args) => {
        if (this.loggerEnabled) {
          if (this.props.logger && this.props.logger.json) {
            this.props.logger.json(...args);
          } else {
            console.log(...args);
          }
        }
      },
      tag: (tag: string, type: `success` | `info` | `error`) => (...args) => {
        if (this.loggerEnabled) {
          console.log(tag, type, ...args);
        }
      },
    };
  }

  cleanup = () => {
    if (this.s) {
      this.s.unsubscribe();
      this.s = undefined;
    }

    return this.client
      .terminate()
      .then(() => {
        this.connected = false;

        if (this.props.onDisconnected) {
          this.props.onDisconnected();
        }
      })
      .catch((error) => {
        this.props.onError(error);
      });
  };

  componentDidMount() {
    window.addEventListener('beforeunload', this.cleanup);

    const { server, user_id } = this.props;

    const rtcConfiguration = this.props.rtcConfiguration || {
      iceServers: [
        {
          urls: 'stun:stun.voip.eutelia.it:3478',
        },
      ],
      sdpSemantics: 'unified-plan',
    };

    this.s = this.tasks
      .pipe(
        concatMap(({ type, load }) => {
          if (type === 'room') {
            return from(this.onChangeRoom(load));
          } else if (type === 'camera') {
            return from(this.onChangeCamera());
          }
        }),
      )
      .subscribe(() => {});

    this.client = new JanusClient({
      onPublisher: this.onPublisher,
      onSubscriber: this.onSubscriber,
      onError: (error) => this.props.onError(error),
      user_id,
      server, //: `${server}/?id=${user_id}`,
      logger: this.logger,
      WebSocket: ReconnectingWebSocket,
      subscriberRtcConfiguration: rtcConfiguration,
      publisherRtcConfiguration: rtcConfiguration,
      transactionTimeout: 15000,
      keepAliveInterval: 10000,
    });

    this.client
      .initialize()
      .then(() => this.client.getRooms())
      .then(({ load }) => {
        this.props.onRooms(load);

        this.connected = true;

        this.forceUpdate();
      })
      .catch((error) => {
        this.props.onError(error);
      });
  }

  componentDidUpdate(prevProps: JanusVideoRoomProps) {
    if (prevProps.room !== this.props.room) {
      this.tasks.next({
        type: 'room',
        load: prevProps.room,
      });
    }

    if (prevProps.cameraId !== this.props.cameraId) {
      this.tasks.next({
        type: 'camera',
      });
    }
  }

  onChangeCamera = async () => {
    if (
      !this.props.cameraId ||
      !this.client ||
      !this.client.publisher ||
      !this.client.publisher.pc ||
      !this.client.publisher.stream
    ) {
      return;
    }

    try {
      await this.client.replaceVideoTrack(this.props.cameraId);
    } catch (error) {
      this.props.onError(error);
    }

    this.forceUpdate();
  };

  onChangeRoom = async (prevRoom: string) => {
    const { mediaConstraints, onError } = this.props;
    const leave = prevRoom && !this.props.room;
    const join = !prevRoom && this.props.room;
    const change = prevRoom && this.props.room && prevRoom !== this.props.room;

    let constraints = null;

    if (this.props.cameraId) {
      constraints = {
        video: {
          deviceId: {
            exact: this.props.cameraId,
          },
        },
      };
    } else if (mediaConstraints) {
      constraints = mediaConstraints;
    } else {
      constraints = {
        video: true,
        audio: true,
      };
    }

    if (leave || change) {
      try {
        await this.client.leave();
      } catch (error) {
        onError(error);
      }
    }

    if (change || join) {
      try {
        await this.client.join(this.props.room, mediaConstraints);
      } catch (error) {
        onError(error);
      }
    }

    this.forceUpdate();
  };

  componentDidCatch(error, info) {
    this.props.onError(error);

    this.logger.info(info);
  }

  componentWillUnmount() {
    this.cleanup();

    window.removeEventListener('beforeunload', this.cleanup);
  }

  onPublisherTerminated = (publisher) => () => {
    if (this.props.onPublisherDisconnected) {
      this.props.onPublisherDisconnected(publisher);
    }
  };

  onPublisherDisconnected = (publisher) => () => {
    if (this.props.onPublisherDisconnected) {
      this.props.onPublisherDisconnected(publisher);
    }
  };

  onPublisher = async (publisher) => {
    publisher.addEventListener('terminated', this.onPublisherTerminated(publisher));

    publisher.addEventListener('disconnected', this.onPublisherDisconnected(publisher));

    if (this.props.onConnected) {
      this.props.onConnected(publisher);
    }

    this.forceUpdate();
  };

  onSubscriberTerminated = (subscriber) => () => {
    if (this.props.onParticipantLeft) {
      this.props.onParticipantLeft(subscriber);
    }

    const subscribers = this.getSubscribers();

    if (this.nParticipants !== subscribers.length) {
      this.nParticipants = subscribers.length;
      this.onParticipantsAmountChange();
    }

    this.forceUpdate();
  };

  onSubscriberLeaving = (subscriber) => () => {
    if (this.props.onParticipantLeft) {
      this.props.onParticipantLeft(subscriber);
    }

    const subscribers = this.getSubscribers();

    if (this.nParticipants !== subscribers.length) {
      this.nParticipants = subscribers.length;
      this.onParticipantsAmountChange();
    }

    this.forceUpdate();
  };

  onSubscriberDisconnected = (subscriber) => () => {
    if (this.props.onParticipantLeft) {
      this.props.onParticipantLeft(subscriber);
    }

    const subscribers = this.getSubscribers();

    if (this.nParticipants !== subscribers.length) {
      this.nParticipants = subscribers.length;
      this.onParticipantsAmountChange();
    }

    this.forceUpdate();
  };

  onSubscriber = async (subscriber) => {
    subscriber.addEventListener('terminated', this.onSubscriberTerminated(subscriber));

    subscriber.addEventListener('leaving', this.onSubscriberLeaving(subscriber));

    subscriber.addEventListener('disconnected', this.onSubscriberLeaving(subscriber));

    try {
      await subscriber.initialize();

      if (this.props.onParticipantJoined) {
        this.props.onParticipantJoined(subscriber);
      }

      const subscribers = this.getSubscribers();

      if (this.nParticipants !== subscribers.length) {
        this.nParticipants = subscribers.length;
        this.onParticipantsAmountChange();
      }

      this.forceUpdate();
    } catch (error) {
      this.props.onError(error);
    }
  };

  renderVideo = (subscriber) => {
    if (this.props.renderStream) {
      return this.props.renderStream(subscriber);
    }

    return (
      <div key={`subscriber-${subscriber.id}`} style={this.state.styles.videoContainer}>
        <Video id={subscriber.id} muted={false} style={this.state.styles.video} stream={subscriber.stream} />
      </div>
    );
  };

  renderLocalVideo = () => {
    const publisher = this.client.publisher;

    if (!publisher) {
      return null;
    }

    if (this.props.renderLocalStream) {
      return this.props.renderLocalStream(publisher);
    }

    this.logger.info('render publisher', publisher);

    return (
      <div style={this.state.styles.localVideoContainer}>
        <Video id={publisher.id} muted={true} style={this.state.styles.localVideo} stream={publisher.stream} />
      </div>
    );
  };

  getSubscribers = () => {
    if (!this.client || !this.client.subscribers) {
      return [];
    }

    return Object.values(this.client.subscribers).filter((element: any) => element && element.ptype === 'subscriber');
  };

  renderContainer = () => {
    if (!this.client || !this.client.subscribers) {
      return null;
    }

    const subscribers = this.getSubscribers();

    const content = (
      <Fragment>
        {this.renderLocalVideo()}
        {subscribers.map((subscriber) => {
          return this.renderVideo(subscriber);
        })}
      </Fragment>
    );

    if (this.props.renderContainer) {
      return this.props.renderContainer(content);
    }

    return <div style={this.state.styles.container}>{content}</div>;
  };

  onParticipantsAmountChange = () => {
    const { getCustomStyles } = this.props;

    if (getCustomStyles) {
      const styles = getCustomStyles(this.nParticipants);
      if (styles) {
        this.setState({
          styles: {
            ...this.defaultStyles,
            ...styles,
          },
        });
      }
    }
  };

  render() {
    if (!this.client) {
      return null;
    }

    return this.renderContainer();
  }
}
