"""settings.json のバックアップ（`<config_dir>/settings-backups/<YYYY_MMDD_HHMM>/`）。
プラグインの削除後も残し、自動では消さない。失敗は OSError として呼び出し元へ返す。"""

import datetime
import os
import re
import shlex
from pathlib import Path
from typing import Any, Optional

import _govdir
from _spool import _state_dir

_BACKUPS_DIRNAME = "settings-backups"
_STAMP_FORMAT = "%Y_%m%d_%H%M"
_FOLDER_PATTERN = re.compile(r"(\d{4}_\d{4}_\d{4})(?:-(\d+))?")
_SETTINGS_FILENAME = "settings.json"
# 本人だけが読める権限で作る。settings.json の env にはトークンが入りうる（Windows では無害）
_FILE_MODE = 0o600
_VERSION_FILENAME = "last_plugin_version"
# statusLine.command はインタプリタの実体（/bin/bash など）も指しうるので、大きなファイルは写さない
MAX_STATUSLINE_FILE_BYTES = 1024 * 1024


def _backups_root() -> Path:
    return _govdir.config_dir().absolute() / _BACKUPS_DIRNAME


def _stamp() -> str:
    return datetime.datetime.now().astimezone().strftime(_STAMP_FORMAT)


def _statusline_files(statusline: Any) -> list[Path]:
    """`statusLine.command` に書かれたパスのうち、`~` と環境変数の展開後に絶対パスで実在する通常ファイル。"""
    command = statusline.get("command") if isinstance(statusline, dict) else None
    if not isinstance(command, str):
        return []
    posix = os.name != "nt"
    try:
        tokens = shlex.split(command, posix=posix)
    except ValueError:
        return []
    files: list[Path] = []
    for token in tokens:
        if not posix:
            token = token.strip('"')
        path = Path(os.path.expandvars(os.path.expanduser(token)))
        if path.is_absolute() and path.is_file() and path not in files:
            files.append(path)
    return files


def _order(name: str) -> Optional[tuple]:
    """フォルダ名の並び順。連番は数値で比べ、`-10` を `-9` より後にする。形の違う名前は None。"""
    match = _FOLDER_PATTERN.fullmatch(name)
    if match is None:
        return None
    return match.group(1), int(match.group(2) or 1)


def _latest(root: Path) -> Optional[Path]:
    folders = [(_order(p.name), p) for p in root.iterdir() if p.is_dir()]
    folders = [(key, p) for key, p in folders if key is not None]
    return max(folders)[1] if folders else None


def _same_as(folder: Optional[Path], contents: dict) -> bool:
    if folder is None:
        return False
    for name, content in contents.items():
        path = folder / name
        if not path.is_file() or path.read_bytes() != content:
            return False
    return True


def _new_folder(root: Path) -> Path:
    """`<stamp>`、既にあれば `<stamp>-2`, `<stamp>-3`… を作って返す。"""
    stamp = _stamp()
    name, n = stamp, 1
    while True:
        try:
            (root / name).mkdir()
            return root / name
        except FileExistsError:
            n += 1
            name = f"{stamp}-{n}"


def _write_all(folder: Path, contents: dict) -> None:
    """O_EXCL で書く。途中で失敗したら、書いた分とフォルダを消してから OSError を返す。"""
    written: list[Path] = []
    try:
        for name, content in contents.items():
            path = folder / name
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, _FILE_MODE)
            written.append(path)
            with os.fdopen(fd, "wb") as f:
                f.write(content)
    except OSError:
        for path in written:
            try:
                path.unlink()
            except OSError:
                pass
        try:
            folder.rmdir()
        except OSError:
            pass
        raise


def backup(settings: Path, statusline: Any = None) -> None:
    """settings.json と、`statusline`（書き換える前の `statusLine`。書き換えないなら None）が指すファイルを保存する。
    直前と同じ内容なら作らない。"""
    contents = {_SETTINGS_FILENAME: settings.read_bytes()}
    for path in _statusline_files(statusline):
        if path.name in contents:
            continue
        # プラグインはこのファイルを書き換えないので、読めなければ写さずに進める
        try:
            if path.stat().st_size > MAX_STATUSLINE_FILE_BYTES:
                continue
            contents[path.name] = path.read_bytes()
        except OSError:
            continue
    root = _backups_root()
    root.mkdir(parents=True, exist_ok=True)
    if _same_as(_latest(root), contents):
        return
    _write_all(_new_folder(root), contents)


def backup_if_updated(version: Optional[str]) -> None:
    """前回動いた版と違えば（記録が無いときも）settings.json を保存してから版を記録する。
    保存に失敗したら記録しない（次のセッションでまた試す）。"""
    if version is None:
        return
    record = _state_dir() / _VERSION_FILENAME
    try:
        if record.read_text(encoding="utf-8") == version:
            return
    except (OSError, ValueError):
        pass
    settings = _govdir.settings_path()
    if settings.exists():
        backup(settings)
    record.parent.mkdir(parents=True, exist_ok=True)
    record.write_text(version, encoding="utf-8")
