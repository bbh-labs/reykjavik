const WIDTH = window.innerWidth;
const HEIGHT = window.innerHeight;
const ACCEL = 0.033;
var Sensitivity = 0.5;
var Speed = 1;

// video stuff
var video, prevCurrentTime = 0, prevPlaybackRate = 0, playbackRate = 0, playing = false, ended = false;
var introText, introContainer, outroText, outroContainer, outroTextTimer;

// microphone stuff
var audioCtx, analyser, dataArray, bufferLength;

// timing stuff
var stop = false;
var frameCount = 0;
var fps = 30;
var fpsInterval, startTime, now, then, elapsed;

// overlay stuff
var overlay;
var sensitivitySlider;
var speedSlider;

window.onload = init;
window.onkeyup = onKeyUp;

function startDraw() {
	fpsInterval = 1000 / fps;
	then = Date.now();
	startTime = then;

	draw();
}

function draw() {
	if (!ended) {
		drawVisual = requestAnimationFrame(draw);
	}

	// calc elapsed time since last loop
	now = Date.now();
	elapsed = now - then;

	// if enough time has elapsed, draw the next frame
	if (elapsed > fpsInterval) {
		// Get ready for next frame by setting then=now, but also adjust for your
		// specified fpsInterval not being a multiple of RAF"s interval (16.7ms)
		then = now - (elapsed % fpsInterval);

		// start doing stuff
		analyser.getByteFrequencyData(dataArray);

		var avg = 0;
		for (var i = 0; i < bufferLength; i++) {
			var v = dataArray[i] / 128.0;
			avg += v;
		}
		avg /= bufferLength;

		prevPlaybackRate = playbackRate;

		if (playbackRate == 0) {
			if (avg > Sensitivity) {
				playbackRate += ACCEL * Speed;
				video.play();
			}
		} else {
			if (playbackRate <= 0.1 && avg > Sensitivity) {
				playbackRate = ACCEL * Speed;
			} else if (playbackRate >= -0.1) {
				if (playbackRate > 0 && !((video.duration() - video.currentTime()) <= 1 / fps)) {
					playbackRate = 0;
				}
				playbackRate = -ACCEL * Speed * 2;
			}
		}

		video.currentTime(video.currentTime() + playbackRate);
		if (video.currentTime() <= (1 / fps)) {
			if (playing) {
				console.log("Reached the beginning");
				introContainer.style.opacity = 1;
				outroContainer.style.display = "table";
				window.clearTimeout(outroTextTimer);
				playing = false;
			}
		} else if (Math.abs(video.duration() - video.currentTime()) < (1 / fps)) {
			if (playing) {
				console.log("Reached the end");
				outroContainer.style.opacity = 1;
				outroTextTimer = window.setTimeout(function() { outroText.style.opacity = 1; }, 2000);
				video.pause();
				video.currentTime(video.duration());
				playing = false;
				ended = true;
				return;
			}
		} else {
			playing = true;
			introContainer.style.opacity = 0;
		}
	}
};

function init() {
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
	}, onMicrophoneReady, function(err) {
		alert("User blocked live input :(");
		return;
	});
}

function hasGetUserMedia() {
	navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
				 navigator.mozGetUserMedia || navigator.msGetUserMedia;
	return !!navigator.getUserMedia;
}

function onMicrophoneReady(stream) {
	// creates the audio context
	try {
		// Fix up for prefixing
		window.AudioContext = window.AudioContext||window.webkitAudioContext;
		audioCtx = new AudioContext();
	} catch(e) {
		alert("Web Audio API is not supported in this browser");
		return;
	}

	// retrieve the current sample rate to be used for WAV packaging
	sampleRate = audioCtx.sampleRate;

	// creates a gain node
	volume = audioCtx.createGain();

	// creates an audio node from the microphone incoming stream
	audioInput = audioCtx.createMediaStreamSource(stream);

	// connect the stream to the gain node
	audioInput.connect(volume);

	// creates analyzer
	analyser = audioCtx.createAnalyser();
	analyser.fftSize = 2048;
	bufferLength = analyser.frequencyBinCount;
	dataArray = new Uint8Array(bufferLength);
	analyser.getByteFrequencyData(dataArray);

	// connect gain to analyzer node
	volume.connect(analyser);

	initVideo();
	initOverlay();
}

function initVideo() {
	playbackRate = 0;
	video = videojs(document.getElementById("video"));
	video.load();
	video.playbackRate(1);
	video.on("loadeddata", function(e) { console.log("Video is ready!"); console.log(video.seekable()); startDraw(); });
	introText = document.getElementById("intro-text");
	outroText = document.getElementById("outro-text");
	introContainer = document.getElementById("intro-container");
	outroContainer = document.getElementById("outro-container");
}

function initOverlay() {
	overlay = document.getElementById("overlay");

	credits = document.getElementById("credits");
	credits.onclick = function(evt) {
		credits.style.display = "none";
	}

	restartButton = document.getElementById("restartButton");
	restartButton.onclick = function(evt) {
		restart();
	}

	creditsButton = document.getElementById("creditsButton");
	creditsButton.onclick = function(evt) {
		credits.style.display = "table";
	}

	fullscreenButton = document.getElementById("fullscreenButton");
	fullscreenButton.onclick = function(evt) {
		if (document.body.requestFullscreen) {
			document.body.requestFullscreen();
		} else if (document.body.msRequestFullscreen) {
			document.body.msRequestFullscreen();
		} else if (document.body.mozRequestFullscreen) {
			document.body.mozRequestFullscreen();
		} else if (document.body.webkitRequestFullscreen) {
			document.body.webkitRequestFullscreen();
		}
	}

	sensitivitySlider = document.getElementById("sensitivity");
	var storedSensitivity = localStorage.getItem("sensitivity");
	if (storedSensitivity) {
		Sensitivity = storedSensitivity;
		sensitivity.value = (Sensitivity * 100).toFixed(0);
	}

	sensitivitySlider.onchange = function(evt) {
		Sensitivity = evt.target.value / 100;
		localStorage.setItem("sensitivity", Sensitivity);
	}

	speedSlider = document.getElementById("speed");
	var storedSpeed = localStorage.getItem("speed");
	if (storedSpeed) {
		Speed = storedSpeed;
		speed.value = (Speed * 100).toFixed(0);
	}

	speedSlider.onchange = function(evt) {
		Speed = evt.target.value / 100 + 1;
		if (Speed < 1) {
			Speed = 1;
		}
		localStorage.setItem("speed", Speed);
	}
}

function onKeyUp(evt) {
	var key = evt.charCode || evt.keyCode;
	switch (key) {
	case 192:
		if (overlay) {
			if (overlay.style.display == "table-cell") {
				overlay.style.display = "none";
			} else {
				overlay.style.display = "table-cell";
			}
		}
		break;
	case 27:
		if (credits) {
			if (credits.style.display == "table") {
				credits.style.display = "none";
			}
		}
	}
}

function restart() {
	playing = true;
	ended = false;
	video.currentTime(0);
	outroContainer.style.display = "none";
	outroContainer.style.opacity = 0;
	introContainer.style.opacity = 1;
	outroText.style.opacity = 0;
	window.clearTimeout(outroTextTimer);
	startDraw();
}
