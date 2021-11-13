/*jshint esversion: 11 */
'use strict';



var localPeerConnection=null;
var remotePeerConnection=null;
var fileInput;



var localOffer=null;

var socket=io();

socket.on('connect', function() {
    socket.emit('my_event', {data: 'hehehe'});
});

socket.on('requestOffer', async function (message){
    let receiveChannel;
    let receiveBuffer = [];
    let receivedSize = 0;

    let bytesPrev = 0;
    let timestampPrev = 0;
    let timestampStart;
    let statsInterval = null;
    let bitrateMax = 0;


    function receiveChannelCallback(event) {
      console.log('Receive Channel Callback');
      receiveChannel = event.channel;
      receiveChannel.binaryType = 'arraybuffer';
      receiveChannel.onmessage = onReceiveMessageCallback;
      receiveChannel.onopen = onReceiveChannelStateChange;
      receiveChannel.onclose = onReceiveChannelStateChange;

      receivedSize = 0;
      bitrateMax = 0;
      // downloadAnchor.textContent = '';
      // downloadAnchor.removeAttribute('download');
      // if (downloadAnchor.href) {
      //   URL.revokeObjectURL(downloadAnchor.href);
      //   downloadAnchor.removeAttribute('href');
      // }
    }

    function onReceiveMessageCallback(event) {
      console.log(`Received Message ${event.data.byteLength}`);
      receiveBuffer.push(event.data);
      receivedSize += event.data.byteLength;
      // receiveProgress.value = receivedSize;

      // we are assuming that our signaling protocol told
      // about the expected file size (and name, hash, etc).
      const file = fileInput.files[0];
      // if (receivedSize === file.size) {
      //   const received = new Blob(receiveBuffer);
      //   receiveBuffer = [];
      //
      //   downloadAnchor.href = URL.createObjectURL(received);
      //   downloadAnchor.download = file.name;
      //   downloadAnchor.textContent =
      //     `Click to download '${file.name}' (${file.size} bytes)`;
      //   downloadAnchor.style.display = 'block';
      //
      //   const bitrate = Math.round(receivedSize * 8 /
      //     ((new Date()).getTime() - timestampStart));
      //   bitrateDiv.innerHTML =
      //     `<strong>Average Bitrate:</strong> ${bitrate} kbits/sec (max: ${bitrateMax} kbits/sec)`;
      //
      //   if (statsInterval) {
      //     clearInterval(statsInterval);
      //     statsInterval = null;
      //   }
      //
      //   closeDataChannels();
      // }
    }

    async function onReceiveChannelStateChange() {
      if (receiveChannel) {
        const readyState = receiveChannel.readyState;
        console.log(`Receive channel state is: ${readyState}`);
        if (readyState === 'open') {
            console.log(`succeed!!!!!!!!!!!!!!`);

        }
      }
    }



    ////////////////////////////////////
    let sid=message.from;
    console.log(`receive remote offer from:\n${message.offer.sdp} `);
    let localPeerConnection=new RTCPeerConnection({
        iceServers: [     // Information about ICE servers - Use your own!
            {
                urls: "stun:stun.stunprotocol.org"
            }]
    });
    localPeerConnection.addEventListener('icecandidate', async event => {
        console.log('My ICE candidate: ', event.candidate);
        socket.emit("sendTo",{target:sid,data:event.candidate});
    });
    localPeerConnection.addEventListener('datachannel', receiveChannelCallback);
    await localPeerConnection.setRemoteDescription(message.offer);
    await localPeerConnection.setLocalDescription(await localPeerConnection.createAnswer());
    console.log(`my answer:\n${localPeerConnection.localDescription.sdp} `);
    socket.emit('replyOffer',{target:sid,offer:localPeerConnection.localDescription});
    socket.on("sendTo",function (message){
        console.log(`receive ice candidate:\n${message.data}`);
        localPeerConnection.addIceCandidate(message.data);
    });
});

$('form#test_connect').submit(function(event) {
    // socket.emit('test_connect', {target:$('#target').val()});
    console.log("start connection");
    createPeerConnection($('#target').val());
    return false;
});


async function createPeerConnection(sid){

function onSendChannelStateChange() {
      if (sendChannel) {
        const {readyState} = sendChannel;
        console.log(`Send channel state is: ${readyState}`);
        if (readyState === 'open') {
            console.log("success!!!!!!!!!!!!!!!!!")
          // sendData();
        }
      }
    }

    function onError(error) {
      if (sendChannel) {
        console.error('Error in sendChannel:', error);
        return;
      }
      console.log('Error in sendChannel which is already closed:', error);
    }


    // function sendData() {
    //   const file = fileInput.files[0];
    //   console.log(`File is ${[file.name, file.size, file.type, file.lastModified].join(' ')}`);
    //
    //   // Handle 0 size files.
    //   statusMessage.textContent = '';
    //   downloadAnchor.textContent = '';
    //   if (file.size === 0) {
    //     bitrateDiv.innerHTML = '';
    //     statusMessage.textContent = 'File is empty, please select a non-empty file';
    //     closeDataChannels();
    //     return;
    //   }
    //   sendProgress.max = file.size;
    //   receiveProgress.max = file.size;
    //   const chunkSize = 16384;
    //   fileReader = new FileReader();
    //   let offset = 0;
    //   fileReader.addEventListener('error', error => console.error('Error reading file:', error));
    //   fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
    //   fileReader.addEventListener('load', e => {
    //     console.log('FileRead.onload ', e);
    //     sendChannel.send(e.target.result);
    //     offset += e.target.result.byteLength;
    //     sendProgress.value = offset;
    //     if (offset < file.size) {
    //       readSlice(offset);
    //     }
    //   });
    //   const readSlice = o => {
    //     console.log('readSlice ', o);
    //     const slice = file.slice(offset, o + chunkSize);
    //     fileReader.readAsArrayBuffer(slice);
    //   };
    //   readSlice(0);
    // }






    //////////////////////////////////////
    localPeerConnection = new RTCPeerConnection({
        iceServers: [     // Information about ICE servers - Use your own!
            {
                urls: "stun:stun.stunprotocol.org"
            }]
    });

    let sendChannel=localPeerConnection.createDataChannel('sendDataChannel');
    sendChannel.binaryType = 'arraybuffer';
    sendChannel.addEventListener('open', onSendChannelStateChange);
    sendChannel.addEventListener('close', onSendChannelStateChange);
    sendChannel.addEventListener('error', onError);

    localPeerConnection.addEventListener('icecandidate', async event => {
        console.log('Local ICE candidate: ', event.candidate);
        socket.emit("sendTo",{target:sid,data:event.candidate});
    });

    let localOffer = await localPeerConnection.createOffer();
    await localPeerConnection.setLocalDescription(localOffer);
    console.log(`create local offer:\n${localOffer.sdp} `);
    socket.emit("requestOffer",{target:sid,offer:localPeerConnection.localDescription});
    socket.on('replyOffer',function (message){
        console.log(`receive remote offer:\n${message.offer.sdp} `);
        localPeerConnection.setRemoteDescription(message.offer);
    });
    socket.on("sendTo",function (message){
        console.log(`receive ice candidate:\n${message.data}`);
        localPeerConnection.addIceCandidate(message.data);
    });
}




