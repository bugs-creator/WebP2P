import uuid
from threading import Lock
from flask import Flask, render_template, session, request, \
    copy_current_request_context, url_for, redirect
from flask_socketio import SocketIO, emit, join_room, leave_room, \
    close_room, rooms, disconnect
from flask_sqlalchemy import SQLAlchemy

from config import Config

# Set this variable to "threading", "eventlet" or "gevent" to test the
# different async modes, or leave it set to None for the application to choose
# the best option based on installed packages.
async_mode = None

app = Flask(__name__)
# 加载配置文件
app.config.from_object(Config)
# db绑定app
db = SQLAlchemy(app)
import models
from models import *

# app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, async_mode=async_mode)
thread = None
thread_lock = Lock()



@socketio.event
def request_file(message):
    res = Res.query.get(message["id"])
    if(res is not None):
        lst=[]
        for i in res.peer:
            lst+=[i.id]
        emit(message["id"],{'peer':lst,'fileInfo':{'id':res.id,'name':res.name,'size':res.size}})
    else:
        emit(message["id"],{})



def background_thread():
    """Example of how to send server generated events to clients."""
    count = 0
    while True:
        socketio.sleep(10)
        count += 1
        socketio.emit('my_response',
                      {'data': 'Server generated event', 'count': count})




@app.route("/")
def peer():
    return render_template('peer.html', async_mode=socketio.async_mode)


@app.route('/<file_id>')
def peerWithStartDownload(file_id):
    return render_template('peer.html', async_mode=socketio.async_mode,default_input=file_id)


@socketio.event
def sendTo(message):
    print(message)
    emit(message["head"], {'from': request.sid, 'data': message["data"]}, to=message["target"])


@socketio.event
def addFile(message):
    id = str(uuid.uuid1()).split("-")[0]
    while Res.query.get(id) is not None:
        id = str(uuid.uuid1()).split("-")[0]
    res = models.Res(id=str(id), name=message["name"], size=message["size"])
    res.peer += [Peer.query.get(request.sid)]
    db.session.add(res)
    db.session.commit()
    emit(str(message["messageId"]), {"id": str(id)})

@socketio.event
def removeFile(message):
    peer = Peer.query.get(request.sid)
    res=Res.query.get(message["id"])
    peer.res.remove(res)
    if res.peer.__len__() == 0:
        db.session.delete(res)
    db.session.add(peer)
    db.session.commit()


@socketio.event
def addReceivedFile(message):
    print(message)
    res = Res.query.get(message["id"])
    res.peer += [Peer.query.get(request.sid)]
    db.session.add(res)
    db.session.commit()


@socketio.event
def requestOffer(message):
    print(message)
    emit("requestOffer", {'from': request.sid, 'offer': message["offer"]}, to=message["target"])


@socketio.event
def replyOffer(message):
    print(message)
    emit("replyOffer", {'from': request.sid, 'offer': message["offer"]}, to=message["target"])


@socketio.event
def my_event(message):
    session['receive_count'] = session.get('receive_count', 0) + 1
    print("get event: " + request.sid)
    emit('my_response',
         {'data': message['data'], 'count': session['receive_count']})


@socketio.event
def my_broadcast_event(message):
    session['receive_count'] = session.get('receive_count', 0) + 1
    emit('my_response',
         {'data': message['data'], 'count': session['receive_count']},
         broadcast=True)


@socketio.event
def test_connect(message):
    print(message["target"])


@socketio.event
def disconnect_request():
    @copy_current_request_context
    def can_disconnect():
        disconnect()

    session['receive_count'] = session.get('receive_count', 0) + 1
    # for this emit we use a callback function
    # when the callback function is invoked we know that the message has been
    # received and it is safe to disconnect
    emit('my_response',
         {'data': 'Disconnected!', 'count': session['receive_count']},
         callback=can_disconnect)


@socketio.event
def my_ping():
    emit('my_pong')


@socketio.event
def connect():
    global thread
    peer = models.Peer(id=request.sid)
    db.session.add(peer)
    db.session.commit()
    with thread_lock:
        if thread is None:
            thread = socketio.start_background_task(background_thread)
    emit('join', {'sid': request.sid})


@socketio.on('disconnect')
def disconnect():
    peer = Peer.query.get(request.sid)
    for res in peer.res:
        if res.peer.__len__() == 1:
            db.session.delete(res)
    db.session.delete(peer)
    db.session.commit()


if __name__ == '__main__':
    socketio.run(app, debug=True,host="0.0.0.0",port=80)
