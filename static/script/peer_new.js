/*jshint esversion: 11 */
'use strict';

var files=[];
var socket=io();
var my_sid=null;
var chunk_size=32768;
var temp_count=0;
var table=document.getElementById("fileListTable");
var num_work=10;


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

function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function readFileAsync(file) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = reject;

    reader.readAsArrayBuffer(file);
  });
}



socket.on("requestOffer",async function (message){
    let peerConnection=await listenConnection(message.from,message.data.offer);


    peerConnection.addEventListener("datachannel",
            function (event) {
            const dataChannel=event.channel;
            dataChannel.binaryType = 'arraybuffer';
            dataChannel.addEventListener('open', function (event) {
                if(dataChannel.readyState==="open"){
                    console.log("dataChannel is open");
                    dataChannel.send("I'm ready");
                }
            });
            dataChannel.addEventListener('close', function (event) {
                console.log("dataChannel is close");
            });
            dataChannel.addEventListener('error', function (error) {
                console.log("dataChannel error");
            });
            dataChannel.onmessage=async function(event){
                console.log("receive: ",event.data);
                dataChannel.send("I'm ready too");
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
    let dataChannels=obj[1];
    let sendQueue=[];
    let chunk_num=Math.ceil(fileInfo.size/chunk_size);
    let download_chunk_num=0;
    let tempData={index:null,data:null};
    let receiveChannel;
    let num_workers=25;
    let work_cache=new Array(num_workers);
    let work_state=new Array(num_workers);


    let table=document.getElementById("downloadListTable");
    let tr=document.createElement("tr");
    let td1=document.createElement("td");
    td1.innerText=fileInfo.id;

    let td2=document.createElement("td");
    td2.innerText=fileInfo.name;

    let td3=document.createElement("td");
    let progress=document.createElement("progress");
    progress.max=chunk_num;
    progress.value=0;
    let text=document.createElement("label");

    td3.appendChild(progress);
    td3.appendChild(text);

    let td4=document.createElement("td");


    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);
    table.appendChild(tr);

    for(let i=0;i<dataChannels.length;i++){
        const dataChannel=dataChannels[i];
        dataChannel.addEventListener('open', function (event) {
            if(dataChannel.readyState==="open"){
                console.log("dataChannel ",i," is open");
                dataChannel.send("I'm ready");
            }
        });
        dataChannel.addEventListener('close', function (event) {
            console.log("dataChannel ",i," is close");
        });
        dataChannel.addEventListener('error', function (error) {
            console.log("dataChannel ",i," error");
        });
        dataChannel.onmessage=async function(event){
            console.log("receive: ",event.data);
        };
    }
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

async function createPeerConnection(target,channel_num){
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



    let dataChannels=new Array(num_work);

    for(let i=0;i<10;i++){
        dataChannels[i]=peerConnection.createDataChannel("dataChannel"+i);
        dataChannels[i].binaryType="arraybuffer";
    }

    return [peerConnection,dataChannels];
}

async function requestConnection(target){
    let obj=await createPeerConnection(target,num_work);
    let peerConnection=obj[0];
    let dataChannels=obj[1];

    let localOffer = await peerConnection.createOffer();
    console.log(`create offer:\n${localOffer.sdp} `);
    await peerConnection.setLocalDescription(localOffer);

    socket.emit("sendTo",{target:target,head:"requestOffer",data:{offer:localOffer}});
    socket.on("replyOffer:"+target,function (message){
        console.log(`receive answer:\n${message.data.offer.sdp} `);
        peerConnection.setRemoteDescription(message.data.offer);
    });
    return [peerConnection,dataChannels];
}

async function listenConnection(target,remoteOffer){
    console.log(`receive offer:\n${remoteOffer.sdp} `);
    let obj=await createPeerConnection(target,0);
    let peerConnection=obj[0];

    await peerConnection.setRemoteDescription(remoteOffer);
    await peerConnection.setLocalDescription(await peerConnection.createAnswer());
    console.log(`my answer:\n${peerConnection.localDescription.sdp} `);

    socket.emit("sendTo",{target:target,head:"replyOffer:"+my_sid,data:{offer:peerConnection.localDescription}});
    return peerConnection;
}
