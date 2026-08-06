from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent.parent
public_dir = root / 'public'
source = public_dir / 'logo.png'

if not source.exists():
    raise FileNotFoundError(source)

img = Image.open(source).convert('RGBA')
width, height = img.size
size = min(width, height)
left = (width - size) // 2
top = (height - size) // 2
img = img.crop((left, top, left + size, top + size))

# Create a centered square logo asset with transparent padding around the content.
canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
canvas.paste(img, (0, 0))

# Create PNG favicons.
for name, target_size in [('krato-favicon-32.png', 32), ('krato-favicon-192.png', 192)]:
    icon = ImageOps.pad(canvas, (target_size, target_size), method=Image.Resampling.LANCZOS, color=(255, 255, 255, 0))
    icon.save(public_dir / name)

# Create a favicon.ico from the 32px icon.
icon_32 = Image.open(public_dir / 'krato-favicon-32.png').convert('RGBA')
icon_16 = ImageOps.contain(icon_32, (16, 16), method=Image.Resampling.LANCZOS)
icon_32 = ImageOps.contain(icon_32, (32, 32), method=Image.Resampling.LANCZOS)
icon_16 = icon_16.convert('RGBA')
icon_32 = icon_32.convert('RGBA')
icon_16.save(public_dir / 'favicon.ico', format='ICO', bitmap_format='bmp', sizes=[(16, 16), (32, 32)])
icon_32.save(public_dir / 'favicon.ico', format='ICO', bitmap_format='bmp', sizes=[(32, 32)])

# Create a rounded-square SVG that uses the supplied PNG as the underlying art.
logo_svg = """<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" role=\"img\" aria-label=\"Krato\">\n  <defs>\n    <clipPath id=\"rounded-square\">\n      <rect x=\"24\" y=\"24\" width=\"464\" height=\"464\" rx=\"120\" ry=\"120\" />\n    </clipPath>\n  </defs>\n  <rect width=\"512\" height=\"512\" fill=\"#00000000\" />\n  <image href=\"/logo.png\" width=\"512\" height=\"512\" preserveAspectRatio=\"xMidYMid meet\" clip-path=\"url(#rounded-square)\" />\n</svg>\n"""
(public_dir / 'logo.svg').write_text(logo_svg, encoding='utf-8')
print('Generated favicon assets and logo.svg')
