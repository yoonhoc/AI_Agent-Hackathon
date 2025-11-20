import sys
import fitz  # PyMuPDF

def parse_boxes(csv_str):
    """
    CSV: x0,y0,x1,y1,x0,y0,x1,y1,...
    (x0, y0) = 좌상단
    (x1, y1) = 우하단 이라고 가정
    """
    nums = [float(v.strip()) for v in csv_str.split(",") if v.strip()]

    if len(nums) < 4:
        return []

    if len(nums) % 4 != 0:
        print("[!] 4개씩 끊을 수 없음 -> 남는 숫자 제거")
        nums = nums[: len(nums) - (len(nums) % 4)]

    boxes = []
    for i in range(0, len(nums), 4):
        x0, y0, x1, y1 = nums[i:i+4]
        # 그대로 사용 (정렬 X)
        boxes.append((x0, y0, x1, y1))

    return boxes


def black_out(pdf_path, csv_str):
    boxes = parse_boxes(csv_str)
    if not boxes:
        print("마스킹할 박스 없음.")
        return

    doc = fitz.open(pdf_path)

    for p in range(len(doc)):
        page = doc[p]
        print(f"[Page {p+1}] {len(boxes)}개 박스")

        for i, (x0, y0, x1, y1) in enumerate(boxes, start=1):

            rect = fitz.Rect(x0/2.1, y0/2.1, x1/2.1, y1/2.1)
            page.draw_rect(rect, color=(0, 0, 0), fill=(0, 0, 0))
            print(f"  - [{i}] Rect{x0, y0, x1, y1}")

    doc.save(pdf_path, incremental=True, encryption=fitz.PDF_ENCRYPT_KEEP)
    doc.close()
    print("[완료] PDF 저장:", pdf_path)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("사용법: python pdf_blur.py <pdf_path> <csv_coords>")
        sys.exit(1)

    black_out(sys.argv[1], sys.argv[2])
