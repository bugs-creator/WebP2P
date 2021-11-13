from app import db
from datetime import datetime


class Peer(db.Model):
    __tablename__ = 'peer'
    id = db.Column(db.String, primary_key=True)
    last_update = db.Column(db.DateTime, index=True, default=datetime.utcnow)


class Res(db.Model):
    __tablename__ = 'res'
    id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String)


peer2Res = db.Table("peer2res",db.Column('peer_id', db.String, db.ForeignKey('peer.id'), primary_key=True),
                    db.Column('res_id', db.String, db.ForeignKey('res.id'), primary_key=True))
