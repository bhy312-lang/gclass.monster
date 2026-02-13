from PIL import Image, ImageDraw, ImageFont
import os

# 경로 설정
base_path = os.path.dirname(os.path.abspath(__file__))
logo_path = os.path.join(base_path, "www", "Logo.png")
res_path = os.path.join(base_path, "android", "app", "src", "main", "res")

# 아이콘 크기 설정
icon_sizes = {
    "mipmap-mdpi": {"launcher": 48, "foreground": 108},
    "mipmap-hdpi": {"launcher": 72, "foreground": 162},
    "mipmap-xhdpi": {"launcher": 96, "foreground": 216},
    "mipmap-xxhdpi": {"launcher": 144, "foreground": 324},
    "mipmap-xxxhdpi": {"launcher": 192, "foreground": 432},
}

def create_icon_with_label(logo_img, size, is_foreground=False):
    """로고 이미지에 '관리자용' 라벨을 로고 아래에 추가한 아이콘 생성"""

    # 새 이미지 생성 (밝은 하늘색 배경)
    if is_foreground:
        icon = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    else:
        # 밝은 파스텔 하늘색 배경
        icon = Image.new('RGBA', (size, size), (224, 242, 254, 255))  # #e0f2fe

    # 라벨 높이 계산 (더 크게)
    label_height = int(size * 0.18)
    label_margin = 0

    # 로고 크기 조정 (라벨 공간 확보)
    logo_size = int(size * 0.55)
    logo_resized = logo_img.copy()
    logo_resized.thumbnail((logo_size, logo_size), Image.Resampling.LANCZOS)

    # 로고와 라벨을 합친 전체 높이 계산
    total_height = logo_resized.height + label_margin + label_height
    start_y = (size - total_height) // 2 - int(size * 0.05)  # 전체를 위로 올림

    # 로고 위치 (중앙 상단)
    logo_x = (size - logo_resized.width) // 2
    logo_y = start_y

    # 로고 붙여넣기
    icon.paste(logo_resized, (logo_x, logo_y), logo_resized if logo_resized.mode == 'RGBA' else None)

    # 라벨 그리기
    draw = ImageDraw.Draw(icon)

    # 라벨 크기 및 위치 계산 (더 넓게)
    label_width = int(size * 0.65)
    label_x = (size - label_width) // 2
    label_y = logo_y + logo_resized.height - int(size * 0.06)  # 로고에 더 겹치게

    # 라벨 배경색 (하늘색/파란색)
    label_color = (14, 165, 233)  # #0ea5e9 (sky-500)

    # 둥근 모서리 라벨 그리기
    corner_radius = int(label_height * 0.4)

    draw.rounded_rectangle(
        [label_x, label_y, label_x + label_width, label_y + label_height],
        radius=corner_radius,
        fill=label_color
    )

    # 폰트 설정 (더 큰 글자)
    font_size = int(label_height * 0.65)
    try:
        font = ImageFont.truetype("malgun.ttf", font_size)
    except:
        try:
            font = ImageFont.truetype("NanumGothic.ttf", font_size)
        except:
            font = ImageFont.load_default()

    # 텍스트 그리기
    text = "관리자용"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    text_x = label_x + (label_width - text_width) // 2
    text_y = label_y + (label_height - text_height) // 2 - 2

    draw.text((text_x, text_y), text, fill=(255, 255, 255), font=font)

    return icon


def create_round_icon(icon_img, size):
    """원형 아이콘 생성"""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([0, 0, size, size], fill=255)

    # 밝은 하늘색 배경
    round_icon = Image.new('RGBA', (size, size), (224, 242, 254, 255))
    round_icon.paste(icon_img, (0, 0))

    output = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    output.paste(round_icon, (0, 0), mask)

    return output


def main():
    print(f"로고 경로: {logo_path}")

    if not os.path.exists(logo_path):
        print(f"오류: 로고 파일을 찾을 수 없습니다: {logo_path}")
        return

    logo = Image.open(logo_path).convert('RGBA')
    print(f"로고 로드 완료: {logo.size}")

    for folder, sizes in icon_sizes.items():
        folder_path = os.path.join(res_path, folder)
        os.makedirs(folder_path, exist_ok=True)

        # ic_launcher.png 생성
        launcher_size = sizes["launcher"]
        launcher_icon = create_icon_with_label(logo, launcher_size, is_foreground=False)
        launcher_path = os.path.join(folder_path, "ic_launcher.png")
        launcher_icon.save(launcher_path, "PNG")
        print(f"생성 완료: {launcher_path}")

        # ic_launcher_round.png 생성
        round_icon = create_round_icon(launcher_icon, launcher_size)
        round_path = os.path.join(folder_path, "ic_launcher_round.png")
        round_icon.save(round_path, "PNG")
        print(f"생성 완료: {round_path}")

        # ic_launcher_foreground.png 생성
        foreground_size = sizes["foreground"]
        foreground_icon = create_icon_with_label(logo, foreground_size, is_foreground=True)
        foreground_path = os.path.join(folder_path, "ic_launcher_foreground.png")
        foreground_icon.save(foreground_path, "PNG")
        print(f"생성 완료: {foreground_path}")

    print("\n모든 아이콘 생성 완료!")


if __name__ == "__main__":
    main()
