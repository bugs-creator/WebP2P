from flask_admin.contrib.sqla import ModelView

from app import db
from datetime import datetime


class Peer(db.Model):
    __tablename__ = 'peer'
    id = db.Column(db.String, primary_key=True)
    routing_metric=db.Column(db.Integer,default=10)
    last_update = db.Column(db.DateTime, index=True, default=datetime.utcnow)
    res = db.relationship("Res", backref="peer", secondary="peer2res")


class Res(db.Model):
    __tablename__ = 'res'
    id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String)
    size = db.Column(db.Integer)
    md5 = db.Column(db.String)


peer2res = db.Table('peer2res',
                    db.Column('peer', db.String, db.ForeignKey('peer.id')),
                    db.Column('res', db.String, db.ForeignKey('res.id'))
                    )


class PeerModelView(ModelView):
    column_list = ('id',"last_update","res")

class ResModelView(ModelView):
    column_list = ('id',"name","size","md5")

