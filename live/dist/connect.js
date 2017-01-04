var CONNECT = function() {
	var videoPreview = document.getElementById('video-preview');
	var playButton = document.getElementById('connect');
	var broadcastDefaultId = 'hungnm07';
	// Handle Connector
	var handleConnector = function(){
					
		// recording is disabled because it is resulting for browser-crash
            var enableRecordings = false;

            var connection = new RTCMultiConnection(null, {
                useDefaultDevices: true // if we don't need to force selection of specific devices
            });

            // its mandatory in v3
            connection.enableScalableBroadcast = true;
			
			// Quality broadcast			
			connection.bandwidth = {
				audio: 128,
				video: 2048
			};
			
            // each relaying-user should serve only 1 users
            connection.maxRelayLimitPerUser = 1;

            // we don't need to keep room-opened
            // scalable-broadcast.js will handle stuff itself.
            connection.autoCloseEntireSession = true;

            // by default, socket.io server is assumed to be deployed on your own URL
            //connection.socketURL = 'https://54.225.234.52:443/';
			//connection.socketURL = '/';
            // comment-out below line if you do not have your own socket.io server
            connection.socketURL = 'https://hungnm-live.herokuapp.com:443/';

            connection.socketMessageEvent = 'hungnm07-broadcast';
            
            // user need to connect server, so that others can reach him.
            connection.connectSocket(function(socket) {
                socket.on('logs', function(log) {
                    document.getElementById('logs').innerHTML = log.replace(/</g, '----').replace(/>/g, '___').replace(/----/g, '(<span style="color:red;">').replace(/___/g, '</span>)');
                });

                // this event is emitted when a broadcast is already created.
                socket.on('join-broadcaster', function(hintsToJoinBroadcast) {
                    console.log('join-broadcaster', hintsToJoinBroadcast);

                    connection.session = hintsToJoinBroadcast.typeOfStreams;
                    connection.sdpConstraints.mandatory = {
                        OfferToReceiveVideo: !!connection.session.video,
                        OfferToReceiveAudio: !!connection.session.audio
                    };
                    connection.join(hintsToJoinBroadcast.userid);
                });

                socket.on('rejoin-broadcast', function(bcID) {
                    console.log('rejoin-broadcast', bcID);

                    connection.attachStreams = [];
                    socket.emit('check-broadcast-presence', bcID, function(isBroadcastExists) {
                        if(!isBroadcastExists) {
                            // the first person (i.e. real-broadcaster) MUST set his user-id
                            connection.userid = bcID;
                        }

                        socket.emit('join-broadcast', {
                            broadcastId: bcID,
                            userid: connection.userid,
                            typeOfStreams: connection.session
                        });
                    });
                });

                socket.on('broadcast-stopped', function(bcID) {
                    // alert('Broadcast has been stopped.');
                    // location.reload();
                    console.error('broadcast-stopped', bcID);
                    //alert('This broadcast has been stopped.');
					toastr["error"]("This broadcast has been stopped.", "Error");
                });

                // this event is emitted when a broadcast is absent.
				// You're a Broadcaster if Broadcast is not exits
				/*
                socket.on('start-broadcasting', function(typeOfStreams) {
                    console.log('start-broadcasting', typeOfStreams);

                    // host i.e. sender should always use this!
                    connection.sdpConstraints.mandatory = {
                        OfferToReceiveVideo: false,
                        OfferToReceiveAudio: false
                    };
                    connection.session = typeOfStreams;

                    // "open" method here will capture media-stream
                    // we can skip this function always; it is totally optional here.
                    // we can use "connection.getUserMediaHandler" instead
                    connection.open(connection.userid, function() {
                        CONNECT.showRoomURL(connection.sessionid);
                    });
                });
				*/
            });

            window.onbeforeunload = function() {
                // Firefox is ugly.
                playButton.disabled = false;
            };
			
			// On Streaming
            connection.onstream = function(event) {
                if(connection.isInitiator && event.type !== 'local') 
                    return;                

                if(event.mediaElement) {
                    event.mediaElement.pause();
                    delete event.mediaElement;
                }

                connection.isUpperUserLeft = false;
                videoPreview.src = URL.createObjectURL(event.stream);
                videoPreview.play();

                videoPreview.userid = event.userid;

                if(event.type === 'local') {
                    videoPreview.muted = true;
                }

                if (connection.isInitiator == false && event.type === 'remote') {
                    // he is merely relaying the media
                    connection.dontCaptureUserMedia = true;
                    connection.attachStreams = [event.stream];
                    connection.sdpConstraints.mandatory = {
                        OfferToReceiveAudio: false,
                        OfferToReceiveVideo: false
                    };

                    var socket = connection.getSocket();
                    socket.emit('can-relay-broadcast');

                    if(connection.DetectRTC.browser.name === 'Chrome') {
                        connection.getAllParticipants().forEach(function(p) {
                            if(p + '' != event.userid + '') {
                                var peer = connection.peers[p].peer;
                                peer.getLocalStreams().forEach(function(localStream) {
                                    peer.removeStream(localStream);
                                });
                                peer.addStream(event.stream);
                                connection.dontAttachStream = true;
                                connection.renegotiate(p);
                                connection.dontAttachStream = false;
                            }
                        });
                    }

                    if(connection.DetectRTC.browser.name === 'Firefox') {
                        // Firefox is NOT supporting removeStream method
                        // that's why using alternative hack.
                        // NOTE: Firefox seems unable to replace-tracks of the remote-media-stream
                        // need to ask all deeper nodes to rejoin
                        connection.getAllParticipants().forEach(function(p) {
                            if(p + '' != event.userid + '') {
                                connection.replaceTrack(event.stream, p);
                            }
                        });
                    }

                    // Firefox seems UN_ABLE to record remote MediaStream
                    // WebAudio solution merely records audio
                    // so recording is skipped for Firefox.
					/*
                    if(connection.DetectRTC.browser.name === 'Chrome') {
                        repeatedlyRecordStream(event.stream);
                    }
					*/
                }
            };            
			
			// On Stream Ended
            connection.onstreamended = function() {
				//alert('This broadcast has been ended!');
				toastr["warning"]("This broadcast has been ended.", "Warning");
			};
			
			// On Leave Stream
            connection.onleave = function(event) {
                if(event.userid !== videoPreview.userid) return;

                var socket = connection.getSocket();
                socket.emit('can-not-relay-broadcast');

                connection.isUpperUserLeft = true;
				/*
                if(allRecordedBlobs.length) {
                    // playing lats recorded blob
                    var lastBlob = allRecordedBlobs[allRecordedBlobs.length - 1];
                    videoPreview.src = URL.createObjectURL(lastBlob);
                    videoPreview.play();
                    allRecordedBlobs = [];
                }
                else if(connection.currentRecorder) {
                    var recorder = connection.currentRecorder;
                    connection.currentRecorder = null;
                    recorder.stopRecording(function() {
                        if(!connection.isUpperUserLeft) return;

                        videoPreview.src = URL.createObjectURL(recorder.blob);
                        videoPreview.play();
                    });
                }

                if(connection.currentRecorder) {
                    connection.currentRecorder.stopRecording();
                    connection.currentRecorder = null;
                }
				*/
            };
			/*
            var allRecordedBlobs = [];

            function repeatedlyRecordStream(stream) {
                if(!enableRecordings) {
                    return;
                }

                connection.currentRecorder = RecordRTC(stream, {
                    type: 'video'
                });

                connection.currentRecorder.startRecording();

                setTimeout(function() {
                    if(connection.isUpperUserLeft || !connection.currentRecorder) {
                        return;
                    }

                    connection.currentRecorder.stopRecording(function() {
                        allRecordedBlobs.push(connection.currentRecorder.blob);

                        if(connection.isUpperUserLeft) {
                            return;
                        }

                        connection.currentRecorder = null;
                        repeatedlyRecordStream(stream);
                    });
                }, 30 * 1000); // 30-seconds
            };
			*/

			// ask node.js server to look for a broadcast
            // if broadcast is available, simply join it. i.e. "join-broadcaster" event should be emitted.
            // if broadcast is absent, simply create it. i.e. "start-broadcasting" event should be fired.
            // Play or Stream?
			
			CONNECT.clickPlay(connection);
			
            
			/*
            if (localStorage.getItem(connection.socketMessageEvent)) {
                broadcastDefaultId = localStorage.getItem(connection.socketMessageEvent);
            } 
			
			else {
                broadcastDefaultId = connection.token();
            }
			*/
			
            
			// Manual set broadcastDefaultId
			/*
            broadcastIDInput.onkeyup = function() {
                localStorage.setItem(connection.socketMessageEvent, this.value);
            };
            */
			// Get broadcast ID from URL
			var broadcastIdURI = CONNECT.getBroadcastIdFromURI();
			
            if(broadcastIdURI && broadcastIdURI.length && broadcastIdURI === broadcastDefaultId) {
								
                broadcastDefaultId = broadcastIdURI;
				
                //localStorage.setItem(connection.socketMessageEvent, broadcastIdURI);

                // auto-join-room
                (function reCheckRoomPresence() {
                    connection.checkPresence(broadcastIdURI, function(isRoomExists) {
                        if(isRoomExists) {
                            playButton.onclick();
                            return;
                        }

                        setTimeout(reCheckRoomPresence, 5000);
                    });
                })();
				
                CONNECT.disableInputButtons();
            }
            
	}
	
	return {
		init: function(){
			handleConnector();						
		},
		// ask node.js server to look for a broadcast
		// if broadcast is available, simply join it. i.e. "join-broadcaster" event should be emitted.
		// if broadcast is absent, simply create it. i.e. "start-broadcasting" event should be fired.
		clickPlay: function(connection) {
			playButton.onclick = function() {
				// Show Player
				document.getElementById('player').style.display = 'block';
				// Click to view stream
				$('a[href="#live"]').trigger('click');
				
                var broadcastId = broadcastDefaultId;
                if (broadcastId.replace(/^\s+|\s+$/g, '').length <= 0) {
                    alert('Please enter broadcast-id');
					toastr["error"]("Sorry! Can not found broadcast's ID.", "Error");                    
                    return false;
                }

                playButton.disabled = true;
				
                connection.session = {
                    audio: true,
                    video: true,
                    oneway: true,
					data:true
                };

                var socket = connection.getSocket();

                socket.emit('check-broadcast-presence', broadcastId, function(isBroadcastExists) {
					console.log('check-broadcast-presence', broadcastId, isBroadcastExists);
                    if(!isBroadcastExists) {
                        // the first person (i.e. real-broadcaster) MUST set his user-id
						toastr["error"]("Sorry! This broadcast has been not started.", "Error");
                        return false;
						//connection.userid = broadcastId;						
                    }                   
					// join broadcast
                    socket.emit('join-broadcast', {
                        broadcastId: broadcastId,
                        userid: connection.userid,
                        typeOfStreams: connection.session
                    });
                });
            };

		},
		// ..........................................................
		// ......................Handling broadcast-id...............
		// ..........................................................
		showRoomURL: function(broadcastId) {
			var roomHashURL = '#' + broadcastId;
			var roomQueryStringURL = '?broadcastId=' + broadcastId;
			
			var html = '<li>' + CONNECT.getBaseUrl() + roomHashURL + '</li>';
			html += '<li>' + CONNECT.getBaseUrl() + roomQueryStringURL + '</li>';

			var roomURLsDiv = document.getElementById('room-info');
			roomURLsDiv.innerHTML = html;
			document.getElementById('show-info').style.display = 'block';
		},
		getBaseUrl: function() {
			return window.location.href.match(/^.*\//);
		},
		disableInputButtons: function() {
			document.getElementById('connect').style.display = 'none';
			broadcastIDInput.disabled = true;
		},
		getBroadcastIdFromURI: function() {
			var params = {},
				r = /([^&=]+)=?([^&]*)/g;

			function d(s) {
				return decodeURIComponent(s.replace(/\+/g, ' '));
			}
			var match, search = window.location.search;
			while (match = r.exec(search.substring(1)))
				params[d(match[1])] = d(match[2]);
			window.params = params;
			            
			var hashString = location.hash.replace('#', '');

            var broadcastId = params.broadcastId;
            if(!broadcastId && hashString.length) {
                broadcastId = hashString;
            }
			return broadcastId;
		}
	};
}();