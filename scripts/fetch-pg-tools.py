"""Fetch only PostgreSQL backup executables and their DLLs from the official Windows ZIP.
Development verification helper; no installation or system changes.
"""
import io
import pathlib
import urllib.request
import zipfile

URL = 'https://get.enterprisedb.com/postgresql/postgresql-18.6-3-windows-x64-binaries.zip'

class RemoteArchive(io.RawIOBase):
    def __init__(self, url):
        self.url = url
        self.pos = 0
        with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=60) as r:
            self.length = int(r.headers['Content-Length'])
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.length + offset
        return self.pos
    def read(self, size=-1):
        if size < 0: size = self.length - self.pos
        if not size: return b''
        end = min(self.length - 1, self.pos + size - 1)
        request = urllib.request.Request(self.url, headers={'Range': f'bytes={self.pos}-{end}'})
        with urllib.request.urlopen(request, timeout=120) as response:
            if response.status != 206: raise RuntimeError('Server did not honor partial download; stopping.')
            value = response.read()
        self.pos += len(value)
        return value

destination = pathlib.Path('artifacts/pgtools').resolve()
destination.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(RemoteArchive(URL)) as archive:
    entries = [entry for entry in archive.infolist() if entry.filename.startswith('pgsql/bin/') and
               (entry.filename.lower().endswith('.dll') or entry.filename.endswith(('/pg_dump.exe', '/pg_restore.exe')))]
    if not any(entry.filename.endswith('/pg_dump.exe') for entry in entries): raise RuntimeError('pg_dump missing from archive')
    for entry in entries:
        target = destination / pathlib.PurePosixPath(entry.filename).name
        if target.exists() and target.stat().st_size == entry.file_size: continue
        target.write_bytes(archive.read(entry))
        print('Downloaded', target.name, flush=True)
print('PostgreSQL client tools ready:', destination)
