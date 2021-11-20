# WEB-BASED P2P FILE SHARING SYSTEM
This is a P2P file sharing system implemented by Flask. All peer operations are performed on a web page. **Only tested in Chrome kernel browser on win10.** If you meet any problems please change the environment and contact me([wenrui.liu@ucdconnect.ie]()).


## Features
### Functions have been implemented
- Resources tracker: The server records the resource information shared by the peer and tracks it. When a new peer obtains the resource, the server actively expands the tracker of the resource. If no peer owns the resource, the server deletes the information and tracker of the resource.
- Chunk verify: When the peer has turned on transfer verify, files will be partitioned for hash Verify to ensure that the data is accurate and not retransmitted entirely.
- Multi-source/multi-channel download: Multiple P2P connections are established at the same time to transfer a file to maximize the transmission speed and evenly share the bandwidth pressure of the P2P network.
- Breakpoint resume: If the download is interrupted due to special circumstances, the peer will keep the incomplete data and continue the transmission after re-establishing the connection.
- Nat across(maybe): The SDP protocol allows peers to carry out NAT across with the help of ICE Server. This project uses a public STUN server([stun.stunprotocol.org]()) to allow peer-to-peer connections under different NATs. But across may fail due to the type of the NAT.

### Advantages
- Easy to use: All tasks are done on the Website, and you don't need to download any plug-ins to set up a P2P transfer.
- Robust: Multi-peer connection and multi-channel design greatly improve the stability of P2P network. Download nodes will be automatically allocated in the most reasonable way for each download, you do not need to worry about download interruptions.

### Problems to be solved
- Transmission speed limit: Some browsers seem to limit the speed of P2P connections to around 2Mb/s over a LAN.
- File size limit: Due to security restrictions of the browser, the download party cannot write the obtained file data to hard storage in real time. It can only be stored locally after the download is complete. Therefore, it is not very friendly for devices with small memory.
- Poor support for mobile devices: The communication quality of mobile devices is worse than that of PC, which is reflected in transmission speed, connection establishment and other aspects.

## Quick start
The demo is now available on [http://peeeer.com]() and a backup on [http://123.57.9.167](). Please contact me ([wenrui.liu@ucdconnect.ie]()) if the website collapsed.

If you want to deploy on your own environment, please following the instruction below.

initialize:
```shell
pip install -r requirements.txt
flask shell 
```

build database:
```python
from app import db
db.create_all()
```

start server:
```shell
python app.py
```

Then open [http://127.0.0.1](), you can use this page to share your file or download file.

## Using instruction
### Share a file
- Click the File Input button to select the file you want to share.
- If you want to ensure that file data is transferred correctly, check verify before selecting the file. This will add MD5 verification during file transfer. (Generally, it is not necessary to check, WebRTC has ensured the accuracy of data transmission, and no data error occurred in all my tests)
- Send your file id or copy url to your friends. They can download it by using it.
- You can see it and manage it in the file table.

### Download a file
- Enter the file ID in the input box, then click on request button. Or just go to the URL a friend shared with you.
- You can monitor the download progress and speed in the Download table. You can click on "abort" to end the download or "refresh" to re-establish the transport channel in the Option column.
- When the download is complete, you will see it in the File table. Click "Download" and it will be saved locally. If you do not remove it from the table, others will also be able to access the resource through you.

## System design
![img.png](img.png)


## Performance static