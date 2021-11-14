/*jshint esversion: 11 */
'use strict';

var files=[];
var socket=io();
var my_sid=null;
var chunk_size=4096;
var temp_count=0;
var table=document.getElementById("fileListTable");


socket.on("join",function (message){
    console.log(message);
    my_sid=message.sid;
    document.getElementById("my_sid").innerText=my_sid;
});



async function addFile(){
    for (let i = 0, l = document.getElementById("fileChooser").files.length; i < l; i++) {
        let file=document.getElementById("fileChooser").files[i];
        await socket.emit("addFile",{count:temp_count,name:file.name,size:file.size});
        socket.on(""+temp_count,function (message){
           file.id=message.id;
           files.push(file);
           addRow(file);
        });
        temp_count++;
    }
}

function addRow(file){
    table=document.getElementById("fileListTable");
    let tr=document.createElement("tr");
    {
        let td = document.createElement("td");
        td.innerText=file.id;
        tr.appendChild(td);
    }
    {
        let td = document.createElement("td");
        td.innerText=file.name;
        tr.appendChild(td);
    }
    {
        let td = document.createElement("td");
        td.innerText=file.size;
        tr.appendChild(td);
    }
    {
        let td = document.createElement("td");
        try {
            td.appendChild(file.url);
        }catch (e) {
            td.innerText="null";
        }
        tr.appendChild(td);
    }
    table.appendChild(tr);
}

socket.on("requestOffer",async function (message){
    let obj=await listenConnection(message.from,message.data.offer);
    let peerConnection=obj[0];
    let sendChannel=obj[1];
    let fileChunk=[];

    peerConnection.addEventListener('datachannel', function (event) {
            let receiveChannel = event.channel;
            receiveChannel.binaryType = 'arraybuffer';
            sendChannel.binaryType=  'arraybuffer';
            receiveChannel.onmessage = function (event) {
                let data=JSON.parse(event.data);
                console.log(`receive data:\n${event.data} `);
                if(data.head==="requestFile"){
                    let file;
                    let file_item;
                    for(let item in files){
                        file_item=files[item];
                        if(file_item.id===data.content.fileId){
                            file=file_item;
                            break;
                        }
                    }

                    let fileReader=new FileReader();

                    sendChannel.addEventListener('open',function (event) {
                        console.log('open ');
                        if(sendChannel.readyState==='open'){
                            let data=fileChunk.shift();
                            sendChannel.send(data[0]);
                            console.log('send1 ', data[0]);
                        }
                    });


                    fileReader.addEventListener('error', error => console.error('Error reading file:', error));
                    fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
                    fileReader.addEventListener('load', e => {
                        index++;
                        console.log('FileRead.onload ', e);
                        fileChunk.push([e.target.result]);
                        if(sendChannel.readyState==='open'){
                            let data=fileChunk.shift();
                            sendChannel.send(data[0]);
                            console.log('send2 ', data[0]);
                        }
                        if ((index)*chunk_size <= file.size) {
                            readSlice(index);
                        }
                    });

                    let index=0;
                    const readSlice = index => {
                        console.log('readSlice ', index);
                        const slice = file.slice(index*chunk_size, (index +1)* chunk_size);
                        fileReader.readAsArrayBuffer(slice);
                    };
                    readSlice(0);
                }
            };
    });
});


async function postFile(id){
    socket.emit("request_file",{id:id});
    socket.on(id,function (message) {
        let target=message.peer;
        let fileInfo=message.fileInfo;
        console.log(`get file info:\n${JSON.stringify(message)} `);
        getFile(target,fileInfo);
    });
}

async function getFile(target, fileInfo){
    let obj=await requestConnection(target);
    let peerConnection=obj[0];
    let dataChannel=obj[1];
    let fileData=[];
    let receiveChannel;
    let size=0;

    dataChannel.binaryType = 'arraybuffer';
    dataChannel.addEventListener('open', function (){
        if(dataChannel.readyState==="open") {
            let data=JSON.stringify({head:"requestFile",content:{fileId:fileInfo.id}});
            console.log(`send request:\n${data} `);
            dataChannel.send(data);
        }
    });
    dataChannel.addEventListener('close', function (){onSendChannelStateChange(dataChannel);});
    dataChannel.addEventListener('error', function (event){onError(dataChannel,event.error);});

    peerConnection.addEventListener('datachannel', async function (event){
        // receiveChannel=event.channel;
        receiveChannel=event.channel;
        receiveChannel.binaryType = 'arraybuffer';
        receiveChannel.onopen=async function (event) {
            console.log("receive channel open");
        };

        receiveChannel.onmessage=async function(event){
            console.log(`receive data:\n${event.data.byteLength} `);
            fileData.push(event.data);
            size+=event.data.byteLength;
            console.log(`accept size:\n${size}/ ${fileInfo.size} `);
            if(size===fileInfo.size){
                saveFile(fileInfo,fileData);
            }
        };
    });
}

async function saveFile(fileInfo,fileData){
    let downloadAnchor=document.createElement("a");
    const received = new Blob(fileData);
    downloadAnchor.href = URL.createObjectURL(received);
    downloadAnchor.download = fileInfo.name;
    downloadAnchor.textContent =
      `download`;
    downloadAnchor.style.display = 'block';
    fileInfo.url=downloadAnchor;
    addRow(fileInfo);
}

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

    let dataChannel=peerConnection.createDataChannel("label", {
        ordered: true
    });
    dataChannel.binaryType = 'arraybuffer';


    return [peerConnection,dataChannel];
}

async function requestConnection(target){
    let obj=await createPeerConnection(target);
    let peerConnection=obj[0];
    let dataChannel=obj[1];

    let localOffer = await peerConnection.createOffer();
    console.log(`create offer:\n${localOffer.sdp} `);
    await peerConnection.setLocalDescription(localOffer);

    socket.emit("sendTo",{target:target,head:"requestOffer",data:{offer:localOffer}});
    socket.on("replyOffer:"+target,function (message){
        console.log(`receive answer:\n${message.data.offer.sdp} `);
        peerConnection.setRemoteDescription(message.data.offer);
    });
    return [peerConnection,dataChannel];
}

async function listenConnection(target,remoteOffer){
    console.log(`receive offer:\n${remoteOffer.sdp} `);
    let obj=await createPeerConnection(target);
    let peerConnection=obj[0];
    let dataChannel=obj[1];

    await peerConnection.setRemoteDescription(remoteOffer);
    await peerConnection.setLocalDescription(await peerConnection.createAnswer());
    console.log(`my answer:\n${peerConnection.localDescription.sdp} `);

    socket.emit("sendTo",{target:target,head:"replyOffer:"+my_sid,data:{offer:peerConnection.localDescription}});
    return [peerConnection,dataChannel];
}


function onSendChannelStateChange(sendChannel) {
      if (sendChannel) {
        const {readyState} = sendChannel;
        console.log(`Send channel state is: ${readyState}`);
        if (readyState === 'open') {
            console.log("success!!!!!!!!!!!!!!!!!");
            sendChannel.send("Test123456");
            sendChannel.send("Test78910");
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