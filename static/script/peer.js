/*jshint esversion: 11 */
'use strict';

var files=[];
var socket=io();
var my_sid=null;
var chunk_size=32768;
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
    let obj=await listenConnection(message.from,message.data.offer);
    let peerConnection=obj[0];
    let sendChannel=obj[1];
    let sendQueue=[];
    let file=null;
    let canSend=true;

    sendChannel.addEventListener('open',async function (event) {
        console.log('open ');
        while(sendChannel.readyState==='open' && sendQueue.length!==0){
            console.log("bufferAmount: ",sendChannel.bufferedAmount);
            console.log("bufferAmountLow: ",sendChannel.bufferedAmountLowThreshold);
            if(sendChannel.bufferedAmount<=1048576) {
                let data = sendQueue.shift();
                sendChannel.send(data[0]);
                console.log('send ', data[0]);
            }else{

                await sleep(10);
            }
        }
    });

    sendChannel.onbufferedamountlow=function (event) {
        // console.log("buffer low!!!!!!!!!");
        canSend=false;
    };

    sendChannel.onerror=function (event) {
        console.log("send error!!!!!!!!");
    };

    const sendMessage=async (message)=>{
        sendQueue.push([message]);
        while(sendChannel.readyState==='open' && sendQueue.length!==0){
                            console.log("bufferAmount: ",sendChannel.bufferedAmount);
                console.log("bufferAmountLow: ",sendChannel.bufferedAmountLowThreshold);
            if(sendChannel.bufferedAmount<=1048576) {
                let data = sendQueue.shift();
                sendChannel.send(data[0]);
                console.log('send ', data[0]);
            }else{
                await sleep(10);
            }
        }
    };


    const getSlice = index => {
        console.log('getSlice ', index);
        return file.slice(index*chunk_size, (index +1)* chunk_size);
    };


    peerConnection.addEventListener('datachannel', function (event) {
            let receiveChannel = event.channel;
            receiveChannel.binaryType = 'arraybuffer';
            sendChannel.binaryType=  'arraybuffer';
            receiveChannel.onmessage = async function (event) {
                let data=JSON.parse(event.data);
                console.log(`receive data:\n${event.data} `);
                if(data.head==="requestFile"){
                    let file_item;
                    for(let item in files){
                        file_item=files[item];
                        if(file_item.id===data.content.fileId){
                            file=file_item;
                            break;
                        }
                    }
                }
                if(data.head==="requestSlice"){
                    let slice=await readFileAsync(getSlice(data.content.index));
                    sendMessage(JSON.stringify({index:data.content.index}));
                    sendMessage(slice);
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
    let sendChannel=obj[1];
    let sendQueue=[];
    let chunk_num=Math.ceil(fileInfo.size/chunk_size);
    let download_chunk_num=0;
    let tempData={index:null,data:null};
    let receiveChannel;
    let num_workers=25;
    let work_cache=new Array(num_workers);
    let work_state=new Array(num_workers);

    for(let i=0;i<num_workers;i++){
        work_cache[i]=[];
        work_state[i]={done:false,last:new Date().getTime()};
    }

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

    sendChannel.binaryType = 'arraybuffer';

    sendChannel.addEventListener('open',function (event) {
        console.log('open ');
        while(sendChannel.readyState==='open' && sendQueue.length!==0){
            let data=sendQueue.shift();
            sendChannel.send(data[0]);
        }
    });

    const sendMessage=message=>{
        // console.log("send:\n",message);
        sendQueue.push([message]);
        while(sendChannel.readyState==='open' && sendQueue.length!==0){
            let data=sendQueue.shift()[0];
            sendChannel.send(data);
        }
    };


    const requestSlice=pos=>{
        let work=work_cache[pos];
        if(work.length*num_workers+pos<=chunk_num-1) {
            work_state[pos].last=new Date().getTime();
            sendMessage(JSON.stringify({head: "requestSlice", content: {index: work.length * num_workers + pos}}));
        }else{
            work_state[pos].done=true;
            console.log("work ",pos, "done!!");
        }
    };

    const awakeWorker=(index,buffer)=>{

        let pos=index%num_workers;
        let sub_index=parseInt(index/num_workers);
        let work=work_cache[pos];
        console.log("awake:",index," worklen:",work.length," subIndex:",sub_index);
        if(work.length-1<sub_index) {
            work.push(buffer);
            download_chunk_num++;
            progress.value=download_chunk_num;
            requestSlice(pos);
        }
    };


    sendMessage(JSON.stringify({head:"requestFile",content:{fileId:fileInfo.id}}));


    let last_num=0;
    let last_time=0;

    async function start(){
        let flag=false;
        console.log("start transmission");
        while(!flag){
            flag=true;
            for(let i=0;i<num_workers;i++){
                if((!work_state[i].done)&&((new Date().getTime()-work_state[i].last)>500)){
                    requestSlice(i);
                    // await sleep(500);
                    console.log("packet loss");
                }
                flag=flag&&work_state[i].done;
            }
            let time_pass=new Date().getTime()-last_time;
            if(time_pass>1000){
                last_time=new Date().getTime();
                let number=chunk_size*(download_chunk_num-last_num);
                last_num=download_chunk_num;
                text.innerText=(1000*number/time_pass/1024/1024).toFixed(2)+"Mb/s";
            }
            await sleep(100);
        }
        let data=[];
        for(let i=0;i<work_cache[0].length;i++){
            for(let j=0;j<num_workers;j++) {
                if(work_cache[j].length-1>=i) {
                    data.push(work_cache[j][i]);
                }
            }
        }
        saveFile(fileInfo,data);
        tr.remove();
        peerConnection.close();
    }

    start();

    const receiveMessage=message=>{
        if(typeof (message)==="string"){
            tempData.index=JSON.parse(message).index;
        }else if(message.byteLength!==undefined){
            if(tempData.index!==null){
                tempData.data=message;
                awakeWorker(tempData.index,tempData.data);
                tempData.index=null;
                tempData.data=null;
            }
        }else{
            console.log("error");
            tempData.index=null;
            tempData.data=null;
        }
    };




    sendChannel.addEventListener('close', function (){onSendChannelStateChange(sendChannel);});
    sendChannel.addEventListener('error', function (event){onError(sendChannel,event.error);});

    peerConnection.addEventListener('datachannel', async function (event){
        receiveChannel=event.channel;
        receiveChannel.binaryType = 'arraybuffer';
        receiveChannel.onopen=async function (event) {
            console.log("receive channel open");
        };
        receiveChannel.onclose=async function (event) {
            console.log("receive channel close");
        };

        receiveChannel.onmessage=async function(event){
            receiveMessage(event.data);
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