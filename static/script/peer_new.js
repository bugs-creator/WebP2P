/*jshint esversion: 11 */
'use strict';

var files=[];
var socket=io();
var my_sid=null;
var chunk_size=16384;
var message_id=0;
var table=document.getElementById("fileListTable");
var num_work=100;
var bufferAmountMax=16384;


socket.on("join",function (message){
    console.log(message);
    my_sid=message.sid;
    document.getElementById("connect_state").innerText="Connection successful! My sid is ";
    document.getElementById("my_sid").innerText=my_sid;
});



async function addFile(){
    for (let i = 0, l = document.getElementById("fileChooser").files.length; i < l; i++) {
        let file=document.getElementById("fileChooser").files[i];
        await socket.emit("addFile",{messageId:message_id,name:file.name,size:file.size});
        socket.on(""+message_id,function (message){
           file.id=message.id;
           files.push(file);
           addRow(file);
        });
        message_id++;
    }
}

async function addReceivedFile(file){
        await socket.emit("addReceivedFile",{messageId:message_id,id:file.id,name:file.name,size:file.size});
        files.push(file);
        addRow(file);
        message_id++;
}

function addRow(file){
    table=document.getElementById("fileListTable");
    document.getElementById("fileTablePlaceHolder").style.display="none";
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
        {
        let td = document.createElement("td");
        tr.appendChild(td);
    }
    table.appendChild(tr);
}

function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function readFileAsync(file) {
    if(file instanceof File) {
        return new Promise((resolve, reject) => {
            let reader = new FileReader();

            reader.onload = () => {
                resolve(reader.result);
            };

            reader.onerror = reject;

            reader.readAsArrayBuffer(file);
        });
    }else {
        return file.arrayBuffer();
    }
}



socket.on("requestOffer",async function (message){
    let peerConnection=await listenConnection(message.from,message.data.offer);
    let file=null;

    const getSlice = index => {
        console.log('getSlice ', index);

        return file.slice(index * chunk_size, (index + 1) * chunk_size);

    };


    peerConnection.addEventListener("datachannel",
        function (event) {
        const dataChannel=event.channel;
        dataChannel.binaryType = 'arraybuffer';
        dataChannel.addEventListener('open', function (event) {
            console.log("dataChannel is open");
        });
        dataChannel.addEventListener('close', function (event) {
            console.log("dataChannel is close");
        });
        dataChannel.addEventListener('error', function (error) {
            console.log("dataChannel error");
        });

        dataChannel.onmessage=async function(event){
            let data=JSON.parse(event.data);
            console.log("receive: ",event.data);
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
                console.log("my answer: ",slice.byteLength);
                dataChannel.send(slice);
            }
        };
    });

});


async function postFile(id){
    socket.emit("request_file",{id:id});
    socket.on(id,function (message) {
        if(message.peer!==undefined) {
            let targets = message.peer;
            let fileInfo = message.fileInfo;
            console.log(`get file info:\n${JSON.stringify(message)} `);
            getFile(targets, fileInfo);
        }else{
            window.alert("No such file!");
        }
    });
}

async function getFile(targets, fileInfo){


    let dataChannels=[];
    let num_peer=targets.length;

    for(let i=0;i<targets.length;i++){
        let channels=await requestDataChannel(targets[i]);
        for(let j=0;j<channels.length;j++){
            dataChannels.push(channels[j]);
        }
    }


    let chunk_num=Math.ceil(fileInfo.size/chunk_size);
    let current_num=0;
    let num_workers=dataChannels.length;
    let work_cache=new Array(num_workers);
    let num_channel=0;

    let received_data=new Array(chunk_num);
    let wait_for_download=[];



    let table=document.getElementById("downloadListTable");
    let tr=document.createElement("tr");

    //id
    let td1=document.createElement("td");
    td1.innerText=fileInfo.id;

    //name
    let td2=document.createElement("td");
    td2.innerText=fileInfo.name;

    //progress
    let td3=document.createElement("td");
    let progress=document.createElement("progress");
    progress.max=chunk_num;
    progress.value=0;
    let text=document.createElement("label");

    td3.appendChild(progress);
    td3.appendChild(text);


    //size
    let td4=document.createElement("td");

    //info
    let td5=document.createElement("td");

    //option
    let td6=document.createElement("td");

    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);
    tr.appendChild(td5);
    tr.appendChild(td6);
    table.appendChild(tr);
    document.getElementById("downloadTablePlaceHolder").style.display="none";


    for(let i=0;i<chunk_num;i++){
        wait_for_download.push(i);
    }


    for(let i=0;i<num_workers;i++){
        work_cache[i]=[];
    }

    const deliveryData=(index,data)=>{
        if(data!==null) {
            if (!(received_data[index] instanceof ArrayBuffer)) {
                received_data[index] = data;
                current_num++;
                td4.innerText=+current_num*chunk_size+"/"+fileInfo.size;
                progress.value=current_num;
            }
        }else{
            wait_for_download.push(index);
        }
    };

    const getDownloadIndex=()=>{
        if(wait_for_download.length!==0) {
            return wait_for_download.pop();
        }
        return null;
    };


    const establishChannel=channel=>{
        const dataChannel=channel;
        let has_request_file=false;
        let cache={index:null,data:null};
        dataChannel.addEventListener('open', function (event) {
            if(dataChannel.readyState==="open"){
                num_channel++;
                console.log(num_channel," channels are open");
                if(!has_request_file){
                    dataChannel.send(JSON.stringify({head:"requestFile",content:{fileId:fileInfo.id}}));
                    has_request_file=true;
                }

                cache.index=getDownloadIndex();
                if(cache.index!==null) {
                    let _index=cache.index;
                    dataChannel.send(JSON.stringify({head: "requestSlice", content: {index: cache.index}}));
                    setTimeout(function () {
                        if(cache.index===_index){
                            deliveryData(_index,null);
                            dataChannel.close();
                        }
                    },500);
                }
            }
        });
        dataChannel.addEventListener('close', function (event) {
            num_channel--;
            console.log("channel close");
        });
        dataChannel.addEventListener('error', function (error) {
            num_channel--;
            console.log("dataChannel error");
        });
        dataChannel.onmessage=async function(event){
            console.log("receive: ",event.data.byteLength);
            deliveryData(cache.index,event.data);
            cache.index=getDownloadIndex();
            if(cache.index!==null) {
                let _index=cache.index;
                dataChannel.send(JSON.stringify({head: "requestSlice", content: {index: cache.index}}));
                setTimeout(function () {
                    if(cache.index===_index){
                        deliveryData(_index,null);
                        dataChannel.close();
                    }},500);
            }
        };
    };

    for(let i=0;i<dataChannels.length;i++){
        establishChannel(dataChannels[i]);
    }




    let last_time=0;
    let last_number=0;


    const update = async () => {
        while(current_num!==chunk_num){
            let number=current_num-last_number;
            let time_pass=new Date().getTime()-last_time;
            text.innerText=(1000*number*chunk_size/time_pass/1024/1024).toFixed(2)+"Mb/s";
            td5.innerText=num_channel+" channels from "+num_peer+" peers";
            last_time=new Date().getTime();
            last_number=current_num;
            await sleep(800);
        }
        let data=[];
        for(let i=0;i<chunk_num;i++){
            data.push(received_data[i]);
        }
        saveFile(fileInfo,data);
        tr.remove();
        if(document.getElementById("downloadListTable").childElementCount===1) {
            document.getElementById("downloadTablePlaceHolder").style.display="table-row";
        }
    };

    update();

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
    received.id=fileInfo.id;
    received.name=fileInfo.name;
    received.url=fileInfo.url;


    addReceivedFile(received);
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

    for(let i=0;i<num_work;i++){
        dataChannels[i]=peerConnection.createDataChannel("dataChannel"+i);
        dataChannels[i].binaryType="arraybuffer";
    }

    return [peerConnection,dataChannels];
}



async function requestDataChannel(target){
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
    return dataChannels;
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
