import os
basedir=os.path.abspath(os.path.dirname(__file__))

class Config(object):
    HOST = '127.0.0.1'
    PORT = '3306'
    DATABASE = 'flask1'
    USERNAME = 'root'
    PASSWORD = '123456'
    SECRET_KEY = 'secret!'

    DB_URI = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'WEBP2P.db')

    SQLALCHEMY_DATABASE_URI = DB_URI
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = True

