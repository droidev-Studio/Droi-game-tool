"""Video processing pipeline: frame extraction, matting, and sprite-sheet export."""
import json
import math
import shutil
import subprocess
from pathlib import Path
from typing import Any, Callable, Optional

from PIL import Image, ImageFilter
from rembg import remove
from rembg.session_factory import new_session

# Lazily initialize one rembg session and reuse it across frames.
_matting_session = None


def _get_session():
    global _matting_session
    if _matting_session is None:
        _matting_session = new_session("u2net")
    return _matting_session


def get_video_info(video_path: Path) -> dict:
    """Read video metadata through ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(video_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    data = json.loads(result.stdout)
    
    duration = 0
    width, height = 0, 0
    fps = 30
    
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video":
            width = int(stream.get("width", 0))
            height = int(stream.get("height", 0))
            if "r_frame_rate" in stream:
                num, den = map(int, stream["r_frame_rate"].split("/"))
                fps = num / den if den else 30
            break
    
    try:
        duration = float(data.get("format", {}).get("duration", 0))
    except (ValueError, KeyError, TypeError):
        duration = 0
    
    return {
        "duration": duration,
        "width": width,
        "height": height,
        "fps": fps,
        "frame_count": int(duration * fps) if duration and fps else 0
    }


def extract_frames(
    video_path: Path,
    output_dir: Path,
    fps: int,
    start_sec: float,
    end_sec: Optional[float],
    max_frames: int,
    on_progress: Optional[Callable[[int, int], None]] = None
) -> list[tuple[Path, float]]:
    """Extract video frames as a PNG sequence."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    info = get_video_info(video_path)
    duration = info["duration"]
    if end_sec is None or end_sec <= 0:
        end_sec = duration
    
    start_sec = max(0, min(start_sec, duration))
    end_sec = max(start_sec, min(end_sec, duration))
    
    interval = 1.0 / fps
    timestamps = []
    t = start_sec
    while t < end_sec and len(timestamps) < max_frames:
        timestamps.append(t)
        t += interval
    
    for i, ts in enumerate(timestamps):
        out_path = output_dir / f"frame_{i:05d}.png"
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(ts),
            "-i", str(video_path),
            "-vframes", "1",
            "-f", "image2",
            str(out_path)
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        if on_progress:
            on_progress(i + 1, len(timestamps))
    
    return [(output_dir / f"frame_{i:05d}.png", timestamps[i]) for i in range(len(timestamps))]


def process_matte(
    input_path: Path,
    output_path: Path,
    alpha_matting: bool = False,
    alpha_matting_foreground_threshold: int = 240,
    alpha_matting_background_threshold: int = 10
) -> None:
    """Run AI matting for a single frame."""
    with open(input_path, "rb") as f:
        input_data = f.read()
    
    output_data = remove(
        input_data,
        session=_get_session(),
        alpha_matting=alpha_matting,
        alpha_matting_foreground_threshold=alpha_matting_foreground_threshold,
        alpha_matting_background_threshold=alpha_matting_background_threshold
    )
    
    with open(output_path, "wb") as f:
        f.write(output_data)


def get_alpha_bbox(img: Image.Image) -> Optional[tuple[int, int, int, int]]:
    """Return the bounding box of non-transparent pixels."""
    if img.mode != "RGBA":
        return None
    alpha = img.split()[-1]
    bbox = alpha.getbbox()
    return bbox


def _clamp_byte(value: float) -> int:
    return max(0, min(255, round(value)))


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _parse_rgb_color(value: str) -> tuple[int, int, int]:
    raw = (value or "#00ff00").strip().lstrip("#")
    if len(raw) == 3:
        raw = "".join(part + part for part in raw)
    if len(raw) != 6:
        return (0, 255, 0)
    try:
        return (int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16))
    except Exception:
        return (0, 255, 0)


def _erode_alpha(img: Image.Image, radius: int) -> Image.Image:
    radius = max(0, int(radius or 0))
    if radius <= 0:
        return img
    red, green, blue, alpha = img.convert("RGBA").split()
    alpha = alpha.filter(ImageFilter.MinFilter(max(3, radius * 2 + 1)))
    return Image.merge("RGBA", (red, green, blue, alpha))


def _apply_post_process(img: Image.Image, params: dict) -> Image.Image:
    green_to_black = bool(params.get("green_to_black", False))
    semitransparent_to_black = bool(params.get("semitransparent_to_black", False))
    semitransparent_to_opaque = bool(params.get("semitransparent_to_opaque", False))
    if not green_to_black and not semitransparent_to_black and not semitransparent_to_opaque:
        return img
    pixels = []
    for r, g, b, a in img.getdata():
        if green_to_black and a > 0 and g > 80 and g > r + 28 and g > b + 28:
            r, g, b = 0, 0, 0
        if semitransparent_to_black and 0 < a < 255:
            r, g, b = 0, 0, 0
        if semitransparent_to_opaque and 0 < a < 255:
            a = 255
        pixels.append((r, g, b, a))
    next_img = Image.new("RGBA", img.size)
    next_img.putdata(pixels)
    return next_img


def _apply_chroma_matte(img: Image.Image, params: dict) -> Image.Image:
    key_r, key_g, key_b = _parse_rgb_color(str(params.get("matte_key_color", "#00ff00")))
    threshold = max(0.0, float(params.get("matte_threshold", 72)))
    softness = max(0.0, float(params.get("matte_softness", 24)))
    despill = max(0.0, min(2.5, float(params.get("matte_despill", 0.85))))
    range_value = max(1.0, softness)
    pixels = []
    for r, g, b, a in img.getdata():
        distance = math.sqrt((r - key_r) ** 2 + (g - key_g) ** 2 + (b - key_b) ** 2)
        next_a = a
        if distance <= threshold:
            next_a = 0
        elif softness > 0 and distance <= threshold + softness:
            next_a = _clamp_byte(((distance - threshold) / range_value) * a)
        if next_a > 0 and despill > 0:
            closeness = _clamp01(1 - max(0.0, distance - threshold) / max(1.0, threshold + softness))
            green_dominance = max(0, g - max(r, b))
            blue_dominance = max(0, b - max(r, g))
            if key_g >= key_r and key_g >= key_b and green_dominance > 0:
                g = _clamp_byte(g - green_dominance * despill * closeness)
            elif key_b >= key_r and key_b >= key_g and blue_dominance > 0:
                b = _clamp_byte(b - blue_dominance * despill * closeness)
        pixels.append((r, g, b, next_a))
    result = Image.new("RGBA", img.size)
    result.putdata(pixels)
    return _erode_alpha(result, int(params.get("matte_halo", 1)))


def _apply_luma_matte(img: Image.Image, params: dict) -> Image.Image:
    black = max(0, min(254, int(params.get("luma_black", 24))))
    white = max(black + 1, min(255, int(params.get("luma_white", 210))))
    gamma = max(0.05, float(params.get("luma_gamma", 0.75)))
    strength = max(0.0, min(2.0, float(params.get("luma_strength", 1.25))))
    range_value = white - black
    pixels = []
    for r, g, b, a in img.getdata():
        luma = (0.2126 * r) + (0.7152 * g) + (0.0722 * b)
        normalized = _clamp01((luma - black) / range_value)
        pixels.append((r, g, b, _clamp_byte(a * _clamp01((normalized ** gamma) * strength))))
    result = Image.new("RGBA", img.size)
    result.putdata(pixels)
    return _erode_alpha(result, int(params.get("matte_halo", 0)))


def _apply_ai_matte(src: Path, dest: Path, matte_strength: float) -> Image.Image:
    matte_tmp = dest.parent / f"_matte_{dest.name}"
    process_matte(
        src, matte_tmp,
        alpha_matting=matte_strength > 0.5,
        alpha_matting_foreground_threshold=int(240 * matte_strength),
        alpha_matting_background_threshold=int(10 * (1 - matte_strength))
    )
    img = Image.open(matte_tmp).convert("RGBA")
    matte_tmp.unlink(missing_ok=True)
    return img


def _combine_ai_luma_matte(original: Image.Image, ai_img: Image.Image, luma_img: Image.Image) -> Image.Image:
    source = original.convert("RGBA")
    ai = ai_img.convert("RGBA")
    luma = luma_img.convert("RGBA")
    pixels = []
    for source_px, ai_px, luma_px in zip(source.getdata(), ai.getdata(), luma.getdata()):
        r, g, b, source_a = source_px
        ai_a = ai_px[3]
        luma_a = luma_px[3]
        pixels.append((r, g, b, min(source_a, max(ai_a, luma_a))))
    result = Image.new("RGBA", source.size)
    result.putdata(pixels)
    return result


def apply_frame_matte(src: Path, dest: Path, matte_strength: float, params: dict) -> Image.Image:
    matte_mode = str(params.get("matte_mode", "ai") or "ai").lower()
    source_img = Image.open(src).convert("RGBA")
    if matte_mode == "none":
        return source_img
    if matte_mode == "chroma":
        return _apply_post_process(_apply_chroma_matte(source_img, params), params)
    if matte_mode == "luma":
        return _apply_post_process(_apply_luma_matte(source_img, params), params)
    if matte_mode in ("ai_luma", "ai+luma", "birefnet_luma"):
        ai_img = _apply_ai_matte(src, dest, matte_strength)
        luma_img = _apply_luma_matte(source_img, params)
        return _apply_post_process(_combine_ai_luma_matte(source_img, ai_img, luma_img), params)

    img = _apply_ai_matte(src, dest, matte_strength)
    return _apply_post_process(img, params)


def process_frame(
    src: Path,
    dest: Path,
    target_w: int,
    target_h: int,
    padding: int,
    bg_color: str,
    transparent: bool,
    crop_mode: str,
    matte_strength: float,
    params: dict
) -> None:
    """Process one extracted frame into a normalized transparent PNG."""
    img = apply_frame_matte(src, dest, matte_strength, params)

    bbox = get_alpha_bbox(img)
    if crop_mode == "tight_bbox" and bbox:
        img = img.crop((bbox[0], bbox[1], bbox[2], bbox[3]))
    elif crop_mode == "safe_bbox" and bbox:
        x1 = max(0, bbox[0] - padding)
        y1 = max(0, bbox[1] - padding)
        x2 = min(img.width, bbox[2] + padding)
        y2 = min(img.height, bbox[3] + padding)
        img = img.crop((x1, y1, x2, y2))

    img.thumbnail((target_w - padding * 2, target_h - padding * 2), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0) if transparent else _parse_bg_color(bg_color))
    paste_x = (target_w - img.width) // 2
    paste_y = (target_h - img.height) // 2
    canvas.paste(img, (paste_x, paste_y), img)
    canvas.save(dest, "PNG")


def _parse_bg_color(s: str) -> tuple[int, int, int, int]:
    """Parse #RRGGBB background colors into RGBA tuples."""
    if s == "transparent" or not s:
        return (0, 0, 0, 0)
    s = s.lstrip("#")
    if len(s) == 6:
        return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)
    return (0, 0, 0, 0)


def compute_layout(
    frame_count: int,
    frame_w: int,
    frame_h: int,
    spacing: int,
    layout_mode: str,
    columns: Optional[int] = None
) -> tuple[int, int, int, int]:
    """Compute sprite sheet column/row layout and final dimensions."""
    if layout_mode == "fixed_columns" and columns:
        cols = columns
    else:
        cols = max(1, math.ceil(math.sqrt(frame_count)))
    
    rows = math.ceil(frame_count / cols) if frame_count else 0
    sheet_w = cols * (frame_w + spacing) - spacing
    sheet_h = rows * (frame_h + spacing) - spacing
    return cols, rows, sheet_w, sheet_h


def compose_sprite_sheet(
    processed_frames: list[Path],
    timestamps: list[float],
    frame_w: int,
    frame_h: int,
    spacing: int,
    layout_mode: str,
    columns: int,
    output_path: Path
) -> dict:
    """Compose processed frames into a sprite sheet and JSON index."""
    n = len(processed_frames)
    cols, rows, sheet_w, sheet_h = compute_layout(n, frame_w, frame_h, spacing, layout_mode, columns)
    
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
    frames_index = []
    
    for i, (fp, t) in enumerate(zip(processed_frames, timestamps)):
        img = Image.open(fp).convert("RGBA")
        col = i % cols
        row = i // cols
        x = col * (frame_w + spacing)
        y = row * (frame_h + spacing)
        sheet.paste(img, (x, y), img)
        frames_index.append({
            "i": i,
            "x": x,
            "y": y,
            "w": frame_w,
            "h": frame_h,
            "t": round(t, 3)
        })
    
    sheet.save(output_path, "PNG")

    return {
        "version": "1.0",
        "frame_size": {"w": frame_w, "h": frame_h},
        "sheet_size": {"w": sheet_w, "h": sheet_h},
        "frames": frames_index
    }


def export_processed_frames(
    job_id: str,
    processed_frames: list[tuple[Path, float]],
    output_path: Path,
) -> list[dict]:
    """Persist processed frame PNGs so the frontend can import video frames directly."""
    frames_output_dir = output_path / "frames"
    if frames_output_dir.exists():
        shutil.rmtree(frames_output_dir, ignore_errors=True)
    frames_output_dir.mkdir(parents=True, exist_ok=True)

    exported = []
    for i, (src, timestamp) in enumerate(processed_frames):
        filename = f"frame_{i + 1:03d}.png"
        dest = frames_output_dir / filename
        shutil.copyfile(src, dest)
        exported.append({
            "i": i,
            "file": f"frames/{filename}",
            "url": f"/api/jobs/{job_id}/frames/{filename}",
            "t": round(timestamp, 3),
        })
    return exported


def run_pipeline(job_id: str, video_path: str, output_base: str, temp_base: str, params: dict) -> dict:
    """Run the full video-to-sprite pipeline for an RQ or sync worker job."""



    vpath = Path(video_path)
    if not vpath.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    temp_path = Path(temp_base) / job_id
    output_path = Path(output_base) / job_id
    temp_path.mkdir(parents=True, exist_ok=True)
    output_path.mkdir(parents=True, exist_ok=True)

    fr = params.get("frame_range", {})
    start_sec = fr.get("start_sec", 0)
    end_sec = fr.get("end_sec")
    fps = params.get("fps", 12)
    max_frames = params.get("max_frames", 300)
    target_size = params.get("target_size", {"w": 256, "h": 256})
    target_w = target_size.get("w", 256)
    target_h = target_size.get("h", 256)
    padding = params.get("padding", 4)
    spacing = params.get("spacing", 4)
    bg_color = params.get("bg_color", "transparent")
    transparent = params.get("transparent", True)
    crop_mode = params.get("crop_mode", "tight_bbox")
    matte_strength = params.get("matte_strength", 0.6)
    layout_mode = params.get("layout_mode", "fixed_columns")
    columns = params.get("columns", 12)

    # 1. Extract frames.
    frames_dir = temp_path / "frames"
    extracted = extract_frames(vpath, frames_dir, fps, start_sec, end_sec, max_frames)

    if not extracted:
        raise ValueError("No frames extracted")

    # 2. Matte and normalize frames.
    processed_dir = temp_path / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)
    processed = []
    total = len(extracted)
    for i, (src, ts) in enumerate(extracted):
        dest = processed_dir / f"out_{i:05d}.png"
        process_frame(src, dest, target_w, target_h, padding, bg_color, transparent, crop_mode, matte_strength, params)
        processed.append((dest, ts))

    # 3. Compose outputs.
    sprite_path = output_path / "sprite.png"
    index_data = compose_sprite_sheet(
        [p[0] for p in processed],
        [p[1] for p in processed],
        target_w, target_h, spacing, layout_mode, columns, sprite_path
    )
    exported_frames = export_processed_frames(job_id, processed, output_path)
    for frame, exported_frame in zip(index_data.get("frames", []), exported_frames):
        frame["file"] = exported_frame["file"]
        frame["url"] = exported_frame["url"]
    index_data["frame_files"] = exported_frames
    index_path = output_path / "index.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index_data, f, indent=2, ensure_ascii=False)

    # 4. Clean temporary frames.
    if frames_dir.exists():
        shutil.rmtree(frames_dir, ignore_errors=True)
    if processed_dir.exists():
        shutil.rmtree(processed_dir, ignore_errors=True)

    return {
        "frame_count": len(processed),
        "width": index_data["sheet_size"]["w"],
        "height": index_data["sheet_size"]["h"]
    }
