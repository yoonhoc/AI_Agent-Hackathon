import fitz
from PIL import Image, ImageDraw
import io
import sys
import argparse
import os
import ast


def blackout_pdf_region(input_pdf, output_pdf, page_num, x, y, width, height):

    doc = fitz.open(input_pdf)
    page = doc[page_num]

    page_height = page.rect.height

    # 2배 확대
    mat = fitz.Matrix(2, 2)
    pix = page.get_pixmap(matrix=mat)

    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    draw = ImageDraw.Draw(img)

    # PDF 좌표 → 이미지 좌표 변환
    pdf_x = x
    pdf_y = page_height - (y + height)

    # 2배 확대 적용
    scaled_x = int(pdf_x * 2)
    scaled_y = int(pdf_y * 2)
    scaled_w = int(width * 2)
    scaled_h = int(height * 2)

    # 검은 박스 채우기
    draw.rectangle(
        [scaled_x, scaled_y, scaled_x + scaled_w, scaled_y + scaled_h],
        fill="black"
    )

    # 이미지 → PDF
    img_bytes = io.BytesIO()
    img.save(img_bytes, format="PNG")
    img_bytes = img_bytes.getvalue()

    new_doc = fitz.open()
    new_page = new_doc.new_page(width=page.rect.width, height=page.rect.height)
    new_page.insert_image(new_page.rect, stream=img_bytes)

    result_doc = fitz.open()
    result_doc.insert_pdf(doc, from_page=0, to_page=len(doc)-1)

    result_doc.delete_page(page_num)
    result_doc.insert_pdf(new_doc, from_page=0, to_page=0, start_at=page_num)

    result_doc.save(output_pdf)

    doc.close()
    new_doc.close()
    result_doc.close()


def process_boxes(input_pdf, boxes, page_num):

    current_file = input_pdf
    temp_file = input_pdf + ".tmp.pdf"

    for idx, b in enumerate(boxes):
        x1, y1, x2, y2 = b
        w = x2 - x1
        h = y2 - y1

        print(f"[{idx+1}] 처리: x={x1}, y={y1}, w={w}, h={h}")

        blackout_pdf_region(current_file, temp_file, page_num, x1, y1, w, h)

        # 임시 파일을 원본으로 교체
        if os.path.exists(temp_file):
            if os.path.exists(current_file):
                os.remove(current_file)
            os.rename(temp_file, current_file)

    print("완료!")


if __name__ == "__main__":

    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("coords_string")
    parser.add_argument("-p", "--page", type=int, default=0)

    args = parser.parse_args()

    # coords_string 은 JSON 전체이므로 꺼내야 함
    raw = ast.literal_eval(args.coords_string)

    # raw = [{ "boxes": [ [...], [...], ... ] }]
    if isinstance(raw, list) and "boxes" in raw[0]:
        boxes = raw[0]["boxes"]
    else:
        boxes = raw  # 혹시 직접 전달된 경우

    print("총 박스 개수:", len(boxes))

    process_boxes(args.pdf, boxes, args.page)
