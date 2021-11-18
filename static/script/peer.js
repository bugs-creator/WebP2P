/*jshint esversion: 11 */
'use strict';

var files=[];
var socket=io();
var my_sid=null;
var chunk_size=32768;
var num_verify_chunk=32;
const md5_length=4;
var message_id=0;
var table=document.getElementById("fileListTable");
var num_work=100;
var bufferAmountMax=16384;


socket.on("join",function (message){
    console.log(message);
    my_sid=message.sid;
    document.getElementById("connect_state").innerText="Connection successful! My sid is ";
    document.getElementById("my_sid").innerText=my_sid;
    document.getElementById("target").removeAttribute('readonly');
    if(document.getElementById("target").value!==""){
        postFile(document.getElementById("target").value);
    }
});



async function addFile(){
    document.getElementById("fileChooser").setAttribute("disabled","disabled");
    for (let i = 0, l = document.getElementById("fileChooser").files.length; i < l; i++) {
        let file=document.getElementById("fileChooser").files[i];
        let verify_progress=document.getElementById("verify_progress");
        let verify_info=document.getElementById("verify_info");
        let verify = null;
        // if(document.getElementById("verify_check").checked) {
        //     verify="";
        //     verify_info.innerText = "start check: " + file.name;
        //     verify_progress.max = Math.ceil(file.size / chunk_size / num_verify_chunk);
        //     verify_progress.value = 0;
        //
        //     for (let index = 0; index * chunk_size * num_verify_chunk <= file.size; index++) {
        //         let slice = await readFileAsync(file.slice(index * chunk_size * num_verify_chunk, (index + 1) * chunk_size * num_verify_chunk));
        //         if (slice.length === 0) {
        //             break;
        //         }
        //         verify_progress.value = index + 1;
        //         let spark = new SparkMD5.ArrayBuffer();
        //         spark.append(slice);
        //         verify += spark.end();
        //         spark.destroy();
        //     }
        //
        //     verify_info.innerText = "check complete!";
        //     console.log(verify);
        // }

        if(document.getElementById("verify_check").checked) {

            verify="";
            verify_info.innerText = "start verify: " + file.name;
            verify_progress.max = Math.ceil(file.size / chunk_size );
            verify_progress.value = 0;
            for (let index = 0; index * chunk_size <= file.size; index++) {
                let slice = await readFileAsync(file.slice(index * chunk_size , (index + 1) * chunk_size ));
                if (slice.length === 0) {
                    break;
                }
                verify_progress.value = index + 1;
                let spark = new SparkMD5.ArrayBuffer();
                spark.append(slice);
                let md5=spark.end().slice(0,md5_length);
                // console.log(md5);
                verify += md5;
                spark.destroy();
            }
            verify_info.innerText = "verify complete!";
        }

        await socket.emit("addFile",{messageId:message_id,name:file.name,size:file.size,md5:verify});
        socket.on(""+message_id,function (message){
           file.id=message.id;
           files.push(file);
           addRow(file);
           socket.off(""+message_id);
        });
        message_id++;
    }
    document.getElementById("fileChooser").removeAttribute("disabled");
}

async function removeFile(id){

}

async function addReceivedFile(file){
        await socket.emit("addReceivedFile",{messageId:message_id,id:file.id,name:file.name,size:file.size});
        files.push(file);
        addRow(file);
        message_id++;
}

function copyText(text, callback){
    var tag = document.createElement('input');
    tag.setAttribute('id', 'cp_hgz_input');
    tag.value = text;
    document.getElementsByTagName('body')[0].appendChild(tag);
    document.getElementById('cp_hgz_input').select();
    document.execCommand('copy');
    document.getElementById('cp_hgz_input').remove();
    if(callback) {callback(text);}
}

function addRow(file){
    table=document.getElementById("fileListTable");
    document.getElementById("fileTablePlaceHolder").style.display="none";
    const id=file.id;

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
        td.innerText=(file.size/1024/1024).toFixed(2)+" Mb";
        tr.appendChild(td);
    }
    {
        let td = document.createElement("td");
        let a=document.createElement("a");
        a.innerText="copy url";
        a.onclick=function (){
            copyText(window.location.host+"/"+file.id);
        };
        td.appendChild(a);
        tr.appendChild(td);
    }
    {
        let td = document.createElement("td");
        let a=document.createElement("a");
        a.innerText="delete\n";
        a.onclick=function (event) {
            tr.remove();
            if(table.childElementCount===1){
                document.getElementById("fileTablePlaceHolder").style.display="table-row";
            }
            socket.emit("removeFile",{id:id});
            for(let i=0;i<files.length;i++){
                if(files[i].id===id){
                    files.splice(i,1);
                    break;
                }
            }
        };
        td.appendChild(a);
        try {
            td.appendChild(file.url);
        }catch (e) {
        }

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

    let last_message=new Date().getTime();

    const getSlice = index => {
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
            last_message=new Date().getTime();
            setTimeout(function () {
                if(new Date().getTime()-last_message>3000){
                    peerConnection.close();
                }
            },3000);
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
                dataChannel.send(slice);
            }
        };
    });

});


async function postFile(id){
    for(let i=0;i<files.length;i++){
        if(id===files[i].id){
            window.alert("You already have the resource.");
            return;
        }
    }
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
        socket.off(id);
    });
}

async function getFile(targets, fileInfo){
    let dataChannels=[];
    let num_peer=targets.length;


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
                    },1000);
                }
            }
        });
        dataChannel.addEventListener('close', function (event) {
            num_channel--;
            console.log("channel close");
            deliveryData(cache.index,cache.data);
        });
        dataChannel.addEventListener('error', function (error) {
            console.log("dataChannel error");
            deliveryData(cache.index,cache.data);
        });
        dataChannel.onmessage=async function(event){
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


    for(let i=0;i<targets.length;i++){
        let channels=await requestDataChannel(targets[i]);
        for(let j=0;j<channels.length;j++){
            dataChannels.push(channels[j]);
            establishChannel(channels[j]);
        }
    }

    let verify=document.getElementById("verify_check").checked;
    if(fileInfo.md5===null){
        verify=false;
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
    let abort=document.createElement("a");
    abort.innerText="abort";
    abort.onclick=function (event) {
        for(let i=0;i<dataChannels.length;i++){
            dataChannels[i].close();
        }
        tr.remove();
        if(document.getElementById("downloadListTable").childElementCount===1) {
            document.getElementById("downloadTablePlaceHolder").style.display="table-row";
        }
    };
    let refresh=document.createElement("a");

    refresh.innerText="refresh\n";
    refresh.onclick=async function (event) {
        for(let i=0;i<dataChannels.length;i++){
            dataChannels[i].close();
        }

        socket.emit("request_file",{id:fileInfo.id});
        socket.on(fileInfo.id,async function (message) {
            if(message.peer!==undefined) {
                let targets = message.peer;
                num_peer=targets.length;
                console.log(`get file info:\n${JSON.stringify(message)} `);
                dataChannels=[];
                for(let i=0;i<targets.length;i++){
                    let channels=await requestDataChannel(targets[i]);
                    for(let j=0;j<channels.length;j++){
                        dataChannels.push(channels[j]);
                        establishChannel(channels[j]);
                    }
                }

            }else{
                window.alert("No such file!");
            }
            socket.off(fileInfo.id);
        });



    };
    td6.appendChild(refresh);
    td6.appendChild(abort);

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
                if(verify){
                     let spark = new SparkMD5.ArrayBuffer();
                     spark.append(data);
                     if(spark.end().slice(0,md5_length)===fileInfo.md5.slice(index*md5_length,(index+1)*md5_length)){
                         // console.log("verify success");
                         received_data[index] = data;
                         current_num++;
                         td4.innerText=+(current_num*chunk_size/1024/1024).toFixed(2)+"/"+(fileInfo.size/1024/1024).toFixed(2)+" Mb";
                         progress.value=current_num;
                     }else{
                         console.log("verify fail");
                     }
                     spark.destroy();
                }else{
                    received_data[index] = data;
                    current_num++;
                    td4.innerText=+(current_num*chunk_size/1024/1024).toFixed(2)+"/"+(fileInfo.size/1024/1024).toFixed(2)+" Mb";
                    progress.value=current_num;
                }
            }
        }else{
            if(index!==null) {
                wait_for_download.push(index);
            }
        }
    };

    const getDownloadIndex=()=>{
        if(wait_for_download.length!==0) {
            return wait_for_download.pop();
        }
        return null;
    };




    // for(let i=0;i<dataChannels.length;i++){
    //     establishChannel(dataChannels[i]);
    // }




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

    peerConnection.onconnectionstatechange=function (event) {
        switch (peerConnection.connectionState){
            case "connected":
                console.log("peer connection connected");
                break;
            case "closed":
                console.log("peer connection closed");
                break;
            case  "disconnected":
                console.log("peer connection disconnected");
                break;
        }
    };

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
