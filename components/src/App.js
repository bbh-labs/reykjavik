var dispatcher = new Flux.Dispatcher();

var App = React.createClass({
    ACCEL: 0.033,
    sensitivity: 0.5,
    speed: 1,
    getInitialState: function() {
        var storedIntroText = localStorage.getItem('introText');
        var storedOutroText = localStorage.getItem('outroText');
        return {
            introText: storedIntroText ? storedIntroText : 'Hi. Make some noise.',
            outroText: storedOutroText ? storedOutroText : 'It\'s great to be with you here in Reykjavik!',
        };
    },
    componentDidMount: function() {
        // Check getUserMedia
    	if (!hasGetUserMedia()) {
    		alert("getUserMedia() is not supported in your browser");
    		return;
    	}

        // initialize microphone
        navigator.getUserMedia({
            "audio": {
                "mandatory": {
                    "googEchoCancellation": "false",
                    "googAutoGainControl": "false",
                    "googNoiseSuppression": "false",
                    "googHighpassFilter": "false"
                },
                "optional": [],
            },
        }, this.onMicrophoneReady, function(err) {
            alert("User blocked live input :(");
            return;
        });

        var storedSensitivity = localStorage.getItem('sensitivity');
        var storedSpeed = localStorage.getItem('speed');
        if (storedSensitivity) {
            this.sensitivity = storedSensitivity;
            this.refs.settings.sensitivity((this.sensitivity * 100).toFixed(0));
        }
        if (storedSpeed) {
            this.speed = storedSpeed;
            this.refs.settings.speed((this.speed * 100).toFixed(0));
        }

        this.listenerID = dispatcher.register(function(payload) {
            switch (payload.type) {
            case 'restart':
                this.restart();
                break;
            case 'sensitivityChanged':
                this.sensitivity = payload.sensitivity / 100;
        		localStorage.setItem("sensitivity", this.sensitivity);
                break;
            case 'speedChanged':
                this.speed = payload.speed / 100;
        		localStorage.setItem("speed", this.speed);
                break;
            case 'introTextChanged':
                this.setState({ introText: payload.text });
        		localStorage.setItem("introText", payload.text);
                break;
            case 'outroTextChanged':
                this.setState({ outroText: payload.text });
        		localStorage.setItem("outroText", payload.text);
                break;
            }
        }.bind(this));
    },
    componentWillUnmount: function() {
        dispatcher.unregister(this.listenerID);
    },
    render: function() {
        var introText = this.state.introText;
        var outroText = this.state.outroText;
        return (
            <div>
                <App.Audio ref='audio' />
                <App.Video ref='video' />
                <App.Intro ref='intro' text={introText} />
                <App.Outro ref='outro' text={outroText} />
                <App.Overlay ref='overlay' />
                <App.Settings ref='settings' introText={introText} outroText={outroText} />
            </div>
        )
    },
    onMicrophoneReady: function(stream) {
        // Initialize Web Audio
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
        } catch(e) {
            alert("Web Audio API is not supported in this browser");
            return;
        }

        // retrieve the current sample rate to be used for WAV packaging
        this.sampleRate = this.audioContext.sampleRate;

        // creates a gain node
        this.volume = this.audioContext.createGain();

        // creates an audio node from the microphone incoming stream
        this.audioInput = this.audioContext.createMediaStreamSource(stream);

        // connect the stream to the gain node
        this.audioInput.connect(this.volume);

        // creates analyzer
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
        this.analyser.getByteFrequencyData(this.dataArray);

        // connect gain to analyzer node
        this.volume.connect(this.analyser);

        this.init();
    },
    init: function() {
        this.playbackRate = 0;

        var video = this.refs.video;
        video.load();
        video.playbackRate(1);
        video.on('loadeddata', function(e) {
            console.log('Video is ready!');
            this.startDraw();
        }.bind(this));
    },
    draw: function() {
    	if (!this.ended) {
    		requestAnimationFrame(this.draw);
    	}

    	// calc elapsed time since last loop
    	var now = Date.now();
    	this.elapsed = now - this.then;

    	// if enough time has elapsed, draw the next frame
    	if (this.elapsed > this.fpsInterval) {
    		// Get ready for next frame by setting then=now, but also adjust for your
    		// specified fpsInterval not being a multiple of RAF"s interval (16.7ms)
    		this.then = now - (this.elapsed % this.fpsInterval);

    		// start doing stuff
    		this.analyser.getByteFrequencyData(this.dataArray);

    		var avg = 0;
    		for (var i = 0; i < this.bufferLength; i++) {
    			var v = this.dataArray[i] / 128.0;
    			avg += v;
    		}
    		avg /= this.bufferLength;

    		this.prevPlaybackRate = this.playbackRate;

            var video = this.refs.video;
            var intro = this.refs.intro;
            var outro = this.refs.outro;

    		if (this.playbackRate == 0) {
    			if (avg > this.sensitivity) {
    				this.playbackRate += this.ACCEL * this.speed;
    				video.play();
    			}
    		} else {
    			if (this.playbackRate <= 0.1 && avg > this.sensitivity) {
    				this.playbackRate = this.ACCEL * this.speed;
    			} else if (this.playbackRate >= -0.1) {
    				if (this.playbackRate > 0 && !((video.duration() - video.currentTime()) <= 1 / this.fps)) {
    					this.playbackRate = 0;
    				}
    				this.playbackRate = -this.ACCEL * this.speed * 2;
    			}
    		}

    		video.currentTime(video.currentTime() + this.playbackRate);
    		if (video.currentTime() < (2 / this.fps)) {
    			if (this.playing) {
    				console.log("Reached the beginning");
                    intro.show();
                    outro.prepare();
    				this.playing = false;
    			}
    		} else if (Math.abs(video.duration() - video.currentTime()) < (1 / this.fps)) {
    			if (this.playing) {
    				console.log("Reached the end");
                    outro.show();
    				video.pause();
    				video.currentTime(video.duration());
    				this.playing = false;
    				this.ended = true;
    				return;
    			}
    		} else {
    			this.playing = true;
                intro.hide();
    		}
    	}
    },
    startDraw: function() {
        this.fps = 30;
        this.fpsInterval = 1000 / this.fps;
        this.then = Date.now();
        this.startTime = this.then;
        this.draw();
    },
    restart: function() {
        this.playbackRate = 0;
        this.playing = true;
        this.ended = false;
        this.refs.video.currentTime(0);
        this.refs.outro.hide();
        this.refs.intro.show();
        this.startDraw();
    },
});

App.Audio = React.createClass({
    render: function() {
    	return (
            <audio autoPlay loop>
        		<source src='audio.ogg' type='audio/ogg' />
        		<source src='audio.mp3' type='audio/mpeg' />
        		<source src='audio.wav' type='audio/wave' />
        		<source src='audio.wav' type='audio/x-wav' />
        		<source src='audio.flac' type='audio/flac' />
        	</audio>
        )
    },
})

App.Video = React.createClass({
    styles: {
        container: {
            position: 'absolute',
            width: '100%',
            height: '100%',
        },
    },
    componentDidMount: function() {
        this.video = videojs(this.getDOMNode());
    },
    render: function() {
        return (
        	<video className='video-js vjs-default-skin' width='100%' height='100%' data-setup='{"controls": false, "preload": "auto"}' style={this.styles.container}>
        		<source src='video.mp4' type='video/mp4' />
        		<source src='video.webm' type='video/webm' />
        		<source src='video.ogv' type='video/ogg' />
        	</video>
        )
    },
    load: function() {
        this.video.load();
    },
    play: function() {
        this.video.play();
    },
    pause: function() {
        this.video.pause();
    },
    duration: function() {
        return this.video.duration();
    },
    playbackRate: function(t) {
        if (typeof(t) == 'number') {
            this.video.playbackRate(t);
        } else {
            return this.video.playbackRate();
        }
    },
    currentTime: function(t) {
        if (typeof(t) == 'number') {
            this.video.currentTime(t);
        } else {
            return this.video.currentTime();
        }
    },
    on: function(a, b) {
        this.video.on(a, b);
    },
});

App.Intro = React.createClass({
    styles: {
        container: {
            position: 'absolute',
            width: '100%',
            height: '100%',
            transition: 'opacity .3s',
            opacity: 0,
        },
        show: {
            opacity: 1,
        },
        text: {
            width: '80%',
            margin: '0 auto',
            fontSize: '2em',
            fontSize: '2rem',
            fontSize: '5vw',
        },
    },
    getInitialState: function() {
        return { show: true };
    },
    render: function() {
        return (
        	<div className='valign-container' style={m(this.styles.container, this.state.show && this.styles.show)}>
        		<div className='valign text-center'>
        			<h1 style={this.styles.text}>
                        {this.props.text}
                    </h1>
        		</div>
        	</div>
        )
    },
    hide: function() {
        this.setState({ show: false });
    },
    show: function() {
        this.setState({ show: true });
    },
});

App.Outro = React.createClass({
    styles: {
        container: {
            display: 'none',
            position: 'absolute',
            width: '100%',
            height: '100%',
            background: 'black',
            transition: 'opacity 2s',
            opacity: 0,
        },
        prepared: {
            display: 'table',
        },
        show: {
            opacity: 1,
        },
        text: {
            width: '80%',
            margin: '0 auto',
            fontSize: '2em',
            fontSize: '2rem',
            fontSize: '5vw',
            transition: 'opacity 2s',
            opacity: 0,
        },
        showText: {
            opacity: 1,
        },
    },
    getInitialState: function() {
        return { show: false, prepared: true };
    },
    render: function() {
        return (
        	<div className='valign-container' style={m(this.styles.container, this.state.prepared && this.styles.prepared, this.state.show && this.styles.show)}>
        		<div className='valign text-center'>
        			<h1 style={m(this.styles.text, this.state.showText && this.styles.showText)}>
                        {this.props.text}
                    </h1>
        		</div>
        	</div>
        )
    },
    prepare: function() {
        this.setState({ prepared: true });
    },
    hide: function() {
		clearTimeout(this.textTimer);
        this.setState({ show: false, prepared: false, showText: false });
    },
    show: function() {
        this.setState({ show: true, prepared: true });

		this.textTimer = setTimeout(function() {
            this.setState({ showText: true });
        }.bind(this), 2000);
    },
});

App.Overlay = React.createClass({
    styles: {
        container: {
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
        },
        credits: {
            background: 'black',
            transition: 'opacity .3s',
            opacity: 0,
        },
        showCredits: {
            opacity: 1,
        },
    },
    getInitialState: function() {
        return { showCredits: false, fullscreen: false };
    },
    render: function() {
        return (
        	<div style={this.styles.container}>
        		<div style={m(this.styles.container, this.styles.credits, this.state.showCredits && this.styles.showCredits)} className='valign-container'>
        			<div className='valign text-center'>
        				<h1>Video by the Kissinger Twins</h1>
        				<h1>Software by Jacky Boen</h1>
        				<h1>Copywriting by Peter Callaghan</h1>
                        <br/>
                        <button onClick={this.handleCloseCredits}>Close</button>
        			</div>
        		</div>
                <div style={this.styles.container}>
    				<button onClick={this.handleSettings}>Settings</button>
        		</div>
        		<div style={this.styles.container} className='valign-container'>
        			<div className='valign-bottom text-left'>
        				<button onClick={this.handleRestart}>Restart</button>
        			</div>
        		</div>
        		<div style={this.styles.container} className='valign-container'>
        			<div className='valign-bottom text-right'>
        				<button onClick={this.handleCredits}>Credits</button>
        			</div>
        		</div>
        		<div style={this.styles.container} className='text-right'>
        			<button onClick={this.handleFullscreen}>{ this.state.fullscreen ? 'Exit Fullscreen' : 'Fullscreen' }</button>
        		</div>
        		<div style={this.styles.container} className='valign-container'>
        			<div className='valign-bottom text-center'>
                        <a href='https://twitter.com/share' className='twitter-share-button' data-url='http://reykjavik.bbhmakerlab.io' data-text='Hello, World!'>Tweet</a>
                        <div className="fb-share-button" data-href="http://reykjavik.bbhmakerlab.io" data-layout="button_count"></div>
        			</div>
        		</div>
        	</div>
        )
    },
    handleSettings: function(evt) {
        dispatcher.dispatch({ type: 'settings' });
    },
    handleCredits: function(evt) {
        this.setState({ showCredits: true });
    },
    handleFullscreen: function(evt) {
        var fullscreen = this.state.fullscreen;
        if (screenfull.enabled) {
            screenfull.toggle();
            this.setState({ fullscreen: !fullscreen });
        }
    },
    handleRestart: function(evt) {
        dispatcher.dispatch({ type: 'restart' });
    },
    handleCloseCredits: function(evt) {
        this.setState({ showCredits: false });
    },
});

App.Settings = React.createClass({
    styles: {
        container: {
            position: 'absolute',
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.5)',
            transition: 'opacity .2s',
            display: 'none',
            opacity: 0,
        },
        show: {
            display: 'block',
            opacity: 1,
        },
        label: {
            display: 'inline-block',
            minWidth: '128px',
        },
        input: {
            width: '200px',
        },
        close: {
            margin: '16px',
        },
    },
    getInitialState: function() {
        return { showSettings: false };
    },
    componentDidMount: function() {
        this.listenerID = dispatcher.register(function(payload) {
            switch (payload.type) {
            case 'settings':
                var showSettings = this.state.showSettings;
                this.setState({ showSettings: !showSettings });
                break;
            }
        }.bind(this));
    },
    componentWillUnmount: function() {
        dispatcher.unregister(this.listenerID);
    },
    render: function() {
        return (
            <div className='text-center' style={m(this.styles.container, this.state.showSettings && this.styles.show)}>
                <div>
        			<div>
        				<label style={this.styles.label}>Threshold</label>
        				<input style={this.styles.input} ref='sensitivity' type='range' onChange={this.handleSensitivity} />
        			</div>
        			<div>
        				<label style={this.styles.label}>Speed</label>
        				<input style={this.styles.input} ref='speed' type='range' onChange={this.handleSpeed} />
        			</div>
        			<div>
                        <label style={this.styles.label}>Intro</label>
                        <input style={this.styles.input} className='black-text' ref='introText' type='text' defaultValue={this.props.introText} onChange={this.handleIntroText} />
        			</div>
        			<div>
                        <label style={this.styles.label}>Outro</label>
                        <input style={this.styles.input} className='black-text' ref='outroText' type='text' defaultValue={this.props.outroText} onChange={this.handleOutroText} />
        			</div>
                    <button onClick={this.handleClose} style={this.styles.close}>Close</button>
    			</div>
    		</div>
        )
    },
    handleClose: function(evt) {
        this.setState({ showSettings: false });
    },
    handleSensitivity: function(evt) {
        dispatcher.dispatch({ type: 'sensitivityChanged', sensitivity: evt.target.value });
    },
    handleSpeed: function(evt) {
        dispatcher.dispatch({ type: 'speedChanged', speed: evt.target.value });
    },
    handleIntroText: function(evt) {
        dispatcher.dispatch({ type: 'introTextChanged', text: evt.target.value });
    },
    handleOutroText: function(evt) {
        dispatcher.dispatch({ type: 'outroTextChanged', text: evt.target.value });
    },
    sensitivity: function(value) {
        this.refs.sensitivity.getDOMNode().value = value;
    },
    speed: function(value) {
        this.refs.speed.getDOMNode().value = value;
    },
});

function hasGetUserMedia() {
	navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
	return !!navigator.getUserMedia;
}

React.render(<App />, document.getElementById('root'));
