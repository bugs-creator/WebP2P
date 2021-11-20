/*jshint esversion: 11 */
'use strict';

var files=[];   //Resources list, my DHRT
var socket=io();    //websocket
var my_sid=null;    //my peer id
const chunk_size=32768;   //size of file chunk
const md5_length=4;     //md5 length
var message_id=0;   //message id
var table=document.getElementById("fileListTable");     //my file table in peer.html
var num_work=30;    //number of channels when RTCConnection is initialized.


//Initialize to get my GUID
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


/**
 * Share a new file and notify the server
 * @returns {Promise<void>}
 */
async function addFile(){
    //Freeze the upload component while processing files
    document.getElementById("fileChooser").setAttribute("disabled","disabled");

    //Gets the file upload list from the file upload component
    for (let i = 0, l = document.getElementById("fileChooser").files.length; i < l; i++) {
        let file=document.getElementById("fileChooser").files[i];
        let verify_progress=document.getElementById("verify_progress");
        let verify_info=document.getElementById("verify_info");
        let verify = null;

        //If the verification mode is enabled, the file blocks generate md5 verification codes
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

        //notify server and get file guid
        await socket.emit("addFile",{messageId:message_id,name:file.name,size:file.size,md5:verify});
        socket.on(""+message_id,function (message){
           file.id=message.id;
           files.push(file);
           addRow(file);
           socket.off(""+message_id);
        });
        message_id++;
    }

    //Unfreeze the upload component
    document.getElementById("fileChooser").removeAttribute("disabled");
}

/**
 * Add a received file
 * @param file
 * @returns {Promise<void>}
 */
async function addReceivedFile(file){
    //Notifies the server that a file has been received
    await socket.emit("addReceivedFile",{messageId:message_id,id:file.id,name:file.name,size:file.size});
    //Add it to the local DHRT
    files.push(file);
    //Display it on the page
    addRow(file);
    //Update message ID
    message_id++;
}


/**
 * copy text function
 * @param text text to be copy
 * @param callback
 */
function copyText(text, callback){
    const tag = document.createElement('input');
    tag.setAttribute('id', 'cp_hgz_input');
    tag.value = text;
    document.getElementsByTagName('body')[0].appendChild(tag);
    document.getElementById('cp_hgz_input').select();
    document.execCommand('copy');
    document.getElementById('cp_hgz_input').remove();
    if(callback) {callback(text);}
}

/**
 * Add a row to the table on the HTML page
 * @param file
 */
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

/**
 * like Thread.sleep() in java
 * @param time
 * @returns {Promise<unknown>}
 */
function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

/**
 * Change the callback read method to the blocking method. Equivalent to the Java file-reading function
 * @param file file wait to be read
 * @returns {Promise<unknown>|ArrayBuffer|Promise<ArrayBuffer>} arrayBuffer of the file
 */
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


/**
 * Listen for negotiation information. This method is called back when another peer requests a connection.
 */
socket.on("requestOffer",async function (message){
    //Establishing a P2P Connection
    let peerConnection=await listenConnection(message.from,message.data.offer);
    //File requested by the other party
    let file=null;
    //Time of the last message
    let last_message=new Date().getTime();

    /**
     *  Get file chunk
     * @param index The index chunk of the file
     * @returns {*} The index cut of the file
     */
    const getSlice = index => {
        return file.slice(index * chunk_size, (index + 1) * chunk_size);

    };

    //Establish a data exchange channel
    peerConnection.addEventListener("datachannel",
        async function (event) {
        const dataChannel=event.channel;
        dataChannel.binaryType = 'arraybuffer';
        dataChannel.bufferedAmountLowThreshold=10000;
        dataChannel.addEventListener('open', function (event) {
            console.log("dataChannel is open");
        });
        dataChannel.addEventListener('close', function (event) {
            console.log("dataChannel is close");
        });
        dataChannel.addEventListener('error', function (error) {
            console.log("dataChannel error");
        });

        //The callback function when a message is received
        dataChannel.onmessage=async function(event){
            let data=JSON.parse(event.data);
            last_message=new Date().getTime();
            console.log("get message:\n",event.data);

            //Set the timeout period. Close the connection after timeout
            setTimeout(function () {
                if(new Date().getTime()-last_message>8000){
                    peerConnection.close();
                }
            },8000);

            //Listen for information on the requested file
            if(data.head==="requestFile"){
                let file_item;
                if(file!==null){
                    if(file.id!==data.content.fileId){
                        console.log("request file: \n",event.data);
                        for (let item in files) {
                            file_item = files[item];
                            if (file_item.id === data.content.fileId) {
                                file = file_item;
                                break;
                            }
                        }
                    }
                }else{
                    console.log("request file: \n",event.data);
                    for (let item in files) {
                        file_item = files[item];
                        if (file_item.id === data.content.fileId) {
                            file = file_item;
                            break;
                        }
                    }
                }
            }

            //Returns an arrayBuffer of the requested file block
            if(data.head==="requestSlice"){
                console.log("request slice: \n",event.data);
                let slice=await readFileAsync(getSlice(data.content.index));
                dataChannel.send(slice);
            }
        };
    });

});

/**
 * Requesting file download
 * @param id ID of the file
 * @returns {Promise<void>}
 */
async function postFile(id){
    //Check whether the file already exists
    for(let i=0;i<files.length;i++){
        if(id===files[i].id){
            window.alert("You already have the resource.");
            return;
        }
    }

    //Request the server for information about the file and the GUID of the peer who owns the file
    socket.emit("request_file",{id:id});

    //Waiting for the server to reply
    socket.on(id,async function (message) {
        if(message.peer!==undefined) {
            let targets = message.peer;
            let fileInfo = message.fileInfo;
            console.log(`get file info:\n${JSON.stringify(message)} `);
            //Requested the file from the peer.
            await getFile(targets, fileInfo);
        }else{
            window.alert("No such file!");
        }
        socket.off(id);
    });
}

/**
 * Requested the file from the peer
 * @param targets peer list
 * @param fileInfo
 * @returns {Promise<void>}
 */
async function getFile(targets, fileInfo){
    let dataChannels=[];
    let num_peer=targets.length;

    /**
     * Initialize dataChannel
     * @param channel
     * @returns {Promise<void>}
     */
    const establishChannel=async channel=>{
        const dataChannel=channel;
        let has_request_file=false;
        let cache={index:null,data:null};

        dataChannel.addEventListener('open', async function (event) {
            if(dataChannel.readyState==="open"){
                num_channel++;
                console.log(num_channel," channels are open");
                if(!has_request_file){
                    dataChannel.send(JSON.stringify({head:"requestFile",content:{fileId:fileInfo.id}}));
                    has_request_file=true;
                }

                //Gets the index of the chunk to be downloaded
                cache.index=getDownloadIndex();
                if(cache.index!==null) {
                    let _index=cache.index;
                    dataChannel.send(JSON.stringify({head: "requestSlice", content: {index: cache.index}}));
                    console.log("request slice \n", _index);
                    //Set the timeout period and close the channel after the timeout
                    setTimeout(function () {
                        if(cache.index===_index){
                            deliveryData(_index,null);
                            dataChannel.close();
                        }
                    },5000);
                }
            }
        });
        dataChannel.addEventListener('close', async function (event) {
            num_channel--;
            console.log("channel close");
            deliveryData(cache.index,cache.data);
        });
        dataChannel.addEventListener('error', async function (error) {
            console.log("dataChannel error");
            deliveryData(cache.index,cache.data);
        });
        dataChannel.onmessage=async function(event){
            console.log("get slice: \n",event.data.byteLength);
            //Pass the received data
            deliveryData(cache.index,event.data);
            //Download new chunk
            cache.index=getDownloadIndex();
            if(cache.index!==null) {
                let _index=cache.index;
                dataChannel.send(JSON.stringify({head: "requestSlice", content: {index: cache.index}}));
                setTimeout(async function () {
                    if(cache.index===_index){
                        deliveryData(_index,null);
                        dataChannel.close();
                    }},5000);
            }
        };
    };

    //Create and init all datachannel
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

    let received_slice=new Array(chunk_num);
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
    abort.onclick=async function (event) {
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
    //Refresh the download
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
                        channels[j].bufferedAmountLowThreshold=10000;
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


    //Post download data
    const deliveryData=async (index,data)=>{
        if(data!==null) {
            if (!(received_slice[index] instanceof ArrayBuffer)) {
                //If validation is enabled, begin validate
                if(verify){
                     let spark = new SparkMD5.ArrayBuffer();
                     spark.append(data);

                     //verify pass
                     if(spark.end().slice(0,md5_length)===fileInfo.md5.slice(index*md5_length,(index+1)*md5_length)){
                         // console.log("verify success");
                         received_slice[index] = data;
                         current_num++;
                         td4.innerText=+(current_num*chunk_size/1024/1024).toFixed(2)+"/"+(fileInfo.size/1024/1024).toFixed(2)+" Mb";
                         progress.value=current_num;
                     }else{//verify not pass
                         wait_for_download.push(index);
                         console.log("verify fail");
                     }
                     spark.destroy();
                }else{//not verify
                    received_slice[index] = data;
                    current_num++;
                    td4.innerText=+(current_num*chunk_size/1024/1024).toFixed(2)+"/"+(fileInfo.size/1024/1024).toFixed(2)+" Mb";
                    progress.value=current_num;
                }
            }
        }else{
            if(index!==null) {//Data failed, return to waiting download queue, waiting for the next download
                wait_for_download.push(index);
            }
        }
    };

    /**
     *
     * @returns {null|*} Gets the index that needs to be downloaded
     */
    const getDownloadIndex=()=>{
        if(wait_for_download.length!==0) {
            return wait_for_download.pop();
        }
        return null;
    };


    let last_time=0;
    let last_number=0;

    /**
     * Update progress bar, download speed and other information
     * @returns {Promise<void>}
     */
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
            data.push(received_slice[i]);
        }
        await saveFile(fileInfo, data);
        tr.remove();
        if(document.getElementById("downloadListTable").childElementCount===1) {
            document.getElementById("downloadTablePlaceHolder").style.display="table-row";
        }
    };
    update();
}

/**
 * Save the downloaded file
 * @param fileInfo information of the file
 * @param fileData byteArray of the file
 * @returns {Promise<void>}
 */
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

/**
 * Creating a P2P Connection
 * @param target target guid
 * @param channel_num The channel number
 * @returns {Promise<(RTCPeerConnection|any[])[]>}
 */
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

/**
 * Request to establish P2P data channels
 * @param target
 * @returns {Promise<RTCPeerConnection|*[]>}
 */
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

/**
 *
 * @param target
 * @param remoteOffer
 * @returns {Promise<RTCPeerConnection|*[]>}
 */
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
