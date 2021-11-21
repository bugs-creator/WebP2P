import uuid
from threading import Lock
from flask import Flask, render_template, session, request, \
    copy_current_request_context, url_for, redirect
from flask_socketio import SocketIO, emit, join_room, leave_room, \
    close_room, rooms, disconnect
from flask_sqlalchemy import SQLAlchemy
from config import Config

async_mode = None

app = Flask(__name__)
app.config.from_object(Config)
db = SQLAlchemy(app)
import models
from models import *
from flask_admin import Admin, AdminIndexView, expose


class DashboardView(AdminIndexView):
    def is_visible(self):
        return False

    @expose('/')
    def index(self):
        return redirect('/admin/peer')


admin = Admin(app, name='Server', template_mode='bootstrap3', index_view=DashboardView())

admin.add_view(PeerModelView(models.Peer, db.session))
admin.add_view(ResModelView(models.Res, db.session))

socketio = SocketIO(app, async_mode=async_mode)
thread = None
thread_lock = Lock()


def takeRoutingMetric(elem):
    return elem.routing_metric


@socketio.event
def request_file(message):
    """
    Receive the file ID requested by the peer and returns the file information in the peer database and the peer list
    that owns the file.
    """
    res = Res.query.get(message["id"])
    if res is not None:
        lst = []
        for i in res.peer:
            lst += [i]
        lst.sort(key=takeRoutingMetric)
        _lst = []
        for i in lst[:10]:
            _lst += [i.id]
        emit(message["id"],
             {'peer': _lst, 'fileInfo': {'id': res.id, 'name': res.name, 'size': res.size, 'md5': res.md5}})
    else:
        emit(message["id"], {})


def background_thread():
    count = 0
    while True:
        socketio.sleep(10)
        count += 1
        socketio.emit('my_response',
                      {'data': 'Server generated event', 'count': count})


@app.route("/")
def peer():
    """
    Return the peer.html
    """
    return render_template('peer.html', async_mode=socketio.async_mode)


@app.route('/<file_id>')
def peerWithStartDownload(file_id):
    """
    Enter the page and download directly
    """
    return render_template('peer.html', async_mode=socketio.async_mode, default_input=file_id)


@socketio.event
def sendTo(message):
    """
    Maintains communication between peers before establishing P2P connections. Mainly used for passing negotiation,
    ICE candidate.
    """
    emit(message["head"], {'from': request.sid, 'data': message["data"]}, to=message["target"])


@socketio.event
def addFile(message):
    """
    Receives the file information owned by the peer, uploads it to the database, enables the file tracing,
    and returns the GUID of the file to the peer
    """
    id = str(uuid.uuid1()).split("-")[0]
    while Res.query.get(id) is not None:
        id = str(uuid.uuid1()).split("-")[0]
    res = models.Res(id=str(id), name=message["name"], size=message["size"], md5=message["md5"])
    res.peer += [Peer.query.get(request.sid)]
    db.session.add(res)
    db.session.commit()
    emit(str(message["messageId"]), {"id": str(id)})


@socketio.event
def removeFile(message):
    """
    Delete the file owned by the peer. If no peer references the file after the relationship is deleted, the file is
    deleted.
    """
    peer = Peer.query.get(request.sid)
    res = Res.query.get(message["id"])
    peer.res.remove(res)
    if res.peer.__len__() == 0:
        db.session.delete(res)
    db.session.add(peer)
    db.session.commit()


@socketio.event
def addReceivedFile(message):
    """
    This method is called when a new peer owns an old file.
    """
    res = Res.query.get(message["id"])
    res.peer += [Peer.query.get(request.sid)]
    db.session.add(res)
    db.session.commit()


@socketio.event
def requestOffer(message):
    """
    Send RTC negotiation
    """
    emit("requestOffer", {'from': request.sid, 'offer': message["offer"]}, to=message["target"])


@socketio.event
def replyOffer(message):
    """
    reply RTC negotiation
    """
    emit("replyOffer", {'from': request.sid, 'offer': message["offer"]}, to=message["target"])


@socketio.event
def my_event(message):
    session['receive_count'] = session.get('receive_count', 0) + 1
    print("get event: " + request.sid)
    emit('my_response',
         {'data': message['data'], 'count': session['receive_count']})


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
    socketio.run(app, debug=True, host="0.0.0.0", port=80)
