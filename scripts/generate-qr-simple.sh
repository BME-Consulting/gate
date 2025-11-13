#!/bin/bash

mkdir -p qr-codes

echo "🔧 Generating QR codes..."
echo ""

# M1フォーマット（完全版）
echo "📋 M1 Format (Full Data):"
npx -y qrcode@1.5.4 -o qr-codes/P001_m1.png "M1|P001|山田太郎|株式会社ABC|C12345|1||35|0"
echo "✅ P001 (完全データ): M1|P001|山田太郎|株式会社ABC|C12345|1||35|0"

npx -y qrcode@1.5.4 -o qr-codes/P002_m1.png "M1|P002|佐藤次郎|株式会社DEF||1||42|0"
echo "✅ P002 (CCUS未登録): M1|P002|佐藤次郎|株式会社DEF||1||42|0"

npx -y qrcode@1.5.4 -o qr-codes/P003_m1.png "M1|P003|John Smith|株式会社GHI|C67890|1|2025-12-31|28|0"
echo "✅ P003 (外国人労働者): M1|P003|John Smith|株式会社GHI|C67890|1|2025-12-31|28|0"

npx -y qrcode@1.5.4 -o qr-codes/P004_m1.png "M1|P004|鈴木三郎|鈴木工務店|C11111|0||55|1"
echo "✅ P004 (一人親方): M1|P004|鈴木三郎|鈴木工務店|C11111|0||55|1"

npx -y qrcode@1.5.4 -o qr-codes/P005_m1.png "M1|P005|田中四郎|田中建設||0||48|0"
echo "✅ P005 (CCUS未登録+社会保険未加入): M1|P005|田中四郎|田中建設||0||48|0"

echo ""
echo "📋 Simple Format (ID Only):"
npx -y qrcode@1.5.4 -o qr-codes/P001_simple.png "P001"
echo "✅ P001 (シンプル): P001"

npx -y qrcode@1.5.4 -o qr-codes/P002_simple.png "P002"
echo "✅ P002 (シンプル): P002"

npx -y qrcode@1.5.4 -o qr-codes/P003_simple.png "P003"
echo "✅ P003 (シンプル): P003"

npx -y qrcode@1.5.4 -o qr-codes/P004_simple.png "P004"
echo "✅ P004 (シンプル): P004"

npx -y qrcode@1.5.4 -o qr-codes/P005_simple.png "P005"
echo "✅ P005 (シンプル): P005"

echo ""
echo "✅ All QR codes generated in: qr-codes/"
ls -lh qr-codes/
