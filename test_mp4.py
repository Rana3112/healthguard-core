import urllib.request
import os
import io

try:
    import cv2
    def check_video(url, name):
        filename = name + ".mp4"
        urllib.request.urlretrieve(url, filename)
        cap = cv2.VideoCapture(filename)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = frame_count/fps if fps > 0 else 0
        print(f"[{name}] {width}x{height}, {frame_count} frames, {fps} fps, Duration: {duration}s")
        cap.release()
        os.remove(filename)

    
    print("Checking video outputs...")
    # The 215kb one we generated with num_frames=161
    check_video("https://cdn.bytez.com/model/output/Lightricks/LTX-Video-0.9.7-dev/6YIZx5LOtRJFHxpYKt1Lr.mp4", "Video1_Test")
    # The user's flat parameter one with duration=8, width=1024, height=1024
    check_video("https://cdn.bytez.com/model/output/Lightricks/LTX-Video-0.9.7-dev/dmUzLflmb79hJR6vBsZ6g.mp4", "Video2_Test")
except Exception as e:
    print(f"Error: {e}")
