/*jshint esversion: 11 */
'use strict';


var socket=io();
var my_sid=null;

socket.emit("join");

socket.on("join",function (message){
    my_sid=message.sid;
    document.getElementById("my_sid").innerText=my_sid;
});

socket.on("requestOffer",function (message){
    listenConnection(message.from,message.data.offer);
});


async function createPeerConnection(target){
    let peerConnection= new RTCPeerConnection({
        iceServers: [
            {
                urls: "stun:stun.stunprotocol.org"
            }]
    });

    peerConnection.addEventListener('icecandidate', async event => {
        console.log(`my ICE candidate:\n${event.candidate} `);
        socket.emit("sendTo",{target:target,head:"ICE:"+my_sid,data:{ice:event.candidate}});
    });

    socket.on("ICE:"+target,async function (message){
        console.log(`remote ICE candidate:\n${message.data.ice} `);
        peerConnection.addIceCandidate(message.data.ice);
    });

    let sendChannel=peerConnection.createDataChannel('sendDataChannel');
    sendChannel.binaryType = 'arraybuffer';
    sendChannel.addEventListener('open', function (){onSendChannelStateChange(sendChannel);});
    sendChannel.addEventListener('close', function (){onSendChannelStateChange(sendChannel);});
    sendChannel.addEventListener('error', function (event){onError(sendChannel,event.error);});


    peerConnection.addEventListener('datachannel', receiveChannelCallback);


    return peerConnection;
}

async function requestConnection(target){
    let peerConnection=await createPeerConnection(target);

    let localOffer = await peerConnection.createOffer();
    console.log(`create offer:\n${localOffer.sdp} `);
    await peerConnection.setLocalDescription(localOffer);

    socket.emit("sendTo",{target:target,head:"requestOffer",data:{offer:localOffer}});
    socket.on("replyOffer:"+target,function (message){
        console.log(`receive answer:\n${message.data.offer.sdp} `);
        peerConnection.setRemoteDescription(message.data.offer);
    });
}

async function listenConnection(target,remoteOffer){

    console.log(`receive offer:\n${remoteOffer.sdp} `);
    let peerConnection=await createPeerConnection(target);

    await peerConnection.setRemoteDescription(remoteOffer);
    await peerConnection.setLocalDescription(await peerConnection.createAnswer());
    console.log(`my answer:\n${peerConnection.localDescription.sdp} `);

    socket.emit("sendTo",{target:target,head:"replyOffer:"+my_sid,data:{offer:peerConnection.localDescription}});
}


function onSendChannelStateChange(sendChannel) {
      if (sendChannel) {
        const {readyState} = sendChannel;
        console.log(`Send channel state is: ${readyState}`);
        if (readyState === 'open') {
            console.log("success!!!!!!!!!!!!!!!!!");
          // sendData();
            sendChannel.send("Test123456");
        }
      }
    }


function onError(sendChannel,error) {
      if (sendChannel) {
        console.error('Error in sendChannel:', error);
        return;
      }
      console.log('Error in sendChannel which is already closed:', error);
}

function receiveChannelCallback(event) {
      let receiveChannel = event.channel;
      receiveChannel.binaryType = 'arraybuffer';
      receiveChannel.onmessage = onReceiveMessageCallback;
      receiveChannel.onopen = function(){onReceiveChannelStateChange(receiveChannel);};
      receiveChannel.onclose = function(){onReceiveChannelStateChange(receiveChannel);};

}

function onReceiveMessageCallback(event) {
      console.log(`Receive message: ${event.data}`);
}

async function onReceiveChannelStateChange(receiveChannel) {
      if (receiveChannel) {
        const readyState = receiveChannel.readyState;
        console.log(`Receive channel state is: ${readyState}`);
        if (readyState === 'open') {
            console.log(`succeed!!!!!!!!!!!!!!`);
        }
      }
}