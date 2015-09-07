const WIDTH = window.innerWidth;
const HEIGHT = window.innerHeight;
const ACCEL = 0.0016;
var Sensitivity = 0.5;

// video stuff
var video, text, textContainer, prevCurrentTime = 0, prevPlaybackRate = 0, playbackRate = 0;

// microphone stuff
var audioCtx, analyser, dataArray, bufferLength;

// timing stuff
var stop = false;
var frameCount = 0;
var fps = 30;
var fpsInterval, startTime, now, then, elapsed;

// settings stuff
var settings;
var sensitivitySlider;

window.onload = init;
window.onkeypress = onKeyPress;

function startDraw() {
	fpsInterval = 1000 / fps;
	then = Date.now();
	startTime = then;

	draw();
}

function draw() {
	drawVisual = requestAnimationFrame(draw);

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
				var d = ACCEL * (1 + avg - Sensitivity);
				playbackRate += d;
				video.play();
			}
		} else {
			if (playbackRate <= 0.1 && avg > Sensitivity) {
				var d = ACCEL * (1 + avg - Sensitivity);
				playbackRate += d;
			} else if (playbackRate >= -0.1) {
				if (playbackRate > 0 && !((video.duration - video.currentTime) <= 1 / fps)) {
					playbackRate = 0;
				}
				var d = ACCEL / (1 + -(avg - Sensitivity));
				playbackRate -= d;
			}
		}

		video.currentTime += playbackRate;
		if (video.currentTime <= 1 / fps) {
			playbackRate = 0;
			video.currentTime = 0;
			text.innerHTML = "Hi. Make some noise.";
			textContainer.style.opacity = 1;
		} else if ((video.duration - video.currentTime) <= 1 / fps) {
			console.log(video.duration + " " + video.currentTime);
			video.currentTime = video.duration - 1 / fps;
			text.innerHTML = "It's great to be with you here in Reykjavik!";
			textContainer.style.opacity = 1;
			playbackRate = 1;
		} else {
			textContainer.style.opacity = 0;
		}

		//console.log("currentTime: " + video.currentTime + " playbackRate: " + playbackRate);
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
	initSettings();
}

function initVideo() {
	playbackRate = 0;
	video = document.getElementById("video");
	video.load();
	video.playbackRate = 0;
	video.onended = function(e) { e.target.play(); }
	video.onloadeddata = function(e) { console.log("Video is ready!"); startDraw(); }
	text = document.getElementById("text");
	textContainer = document.getElementById("text-container");
}

function initSettings() {
	settings = document.getElementById("settings");

	sensitivitySlider = document.getElementById("sensitivity");
	var storedSensitivity = localStorage.getItem("sensitivity");
	if (storedSensitivity) {
		Sensitivity = storedSensitivity;
		sensitivity.value = (Sensitivity * 100).toFixed(0);
		console.log(sensitivity.value);
	}

	sensitivitySlider.onchange = function(evt) {
		Sensitivity = evt.target.value / 100;
		localStorage.setItem("sensitivity", Sensitivity);
	}
}

function onKeyPress(evt) {
	var key = evt.charCode || evt.keyCode;
	switch (key) {
	case 96:
		if (settings) {
			if (settings.style.display == "table-cell") {
				settings.style.display = "none";
			} else {
				settings.style.display = "table-cell";
			}
		}
		break;
	}
}
