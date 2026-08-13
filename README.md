# ファイル紹介

このリポジトリには、ブラウザだけで動作する単体HTML、ChatGPTやGeminiを使う補助ツール、ブラウザ拡張機能、JavaScriptプラグイン、試作・検証用ファイルをまとめています。

GitHub Pagesで公開しているHTMLは、基本的に次の形式で開けます。

https://uni928.github.io/Uni928PublicHTMLs/ファイル名

サブディレクトリ内のファイルは、ディレクトリ名もURLに含めます。IndexedDBやlocalStorageを利用するページは、入力内容をブラウザ内に保存します。外部APIを利用するページでは、各自のAPIキーが必要です。

> 注意：現行READMEの「パーティゲーム for ワンナイト人狼」のリンク先は index71.html になっていますが、現在のファイル内容ではパーティゲームは index70.html です。index71.html は URL Share です。

## ルート直下のHTML・ツール

| ファイル | 紹介 |
| --- | --- |
| index.html | フォルダを選択し、ファイル名と説明を一覧化して、ChatGPTに目的のファイルを探してもらうためのプロンプトを作成します。 |
| index2.html | コードや設定ファイルなどの内容を貼り付け、共同開発で分かりやすいファイル名の候補をChatGPTに提案してもらう補助ツールです。 |
| index3.html | index2.htmlと同系統のファイル名提案ツールです。日本語のファイル名を提案するプロンプトに調整した派生版です。 |
| index4.html | URLショートカットを登録して検索・整理・起動する、検索ページのサブ版です。 |
| index5.html | 文章作成スタジオです。入力内容の自動保存、Undo・Redo、テキストファイルへの保存に対応しています。 |
| index6.html | ローカルHTMLをタイトルやファイル名付きで登録し、検索・一覧表示・再利用できるHTML Libraryです。 |
| index7.html | dポイントのボーナスポイントを利用した投資について説明する、シンプルな攻略ガイドです。 |
| index8.html | dポイントのボーナスポイントと金ETFを組み合わせた長期回収について、より詳しく整理した攻略ページです。 |
| index9.html | クレジットカードを使わず、AmazonギフトカードでPrime Videoを利用する方法を説明する資料ページです。 |
| index10.html | ホロカ風のライフカウンターです。ターン変更、サイコロ、スキル状態、IndexedDBによる状態保存に対応しています。 |
| index11.html | スマートフォンを順番に回して遊ぶ、招待隠蔽・感染型の正体隠匿ゲームです。 |
| index12.html | Odds-parkの出馬表HTMLを貼り付け、各馬のスピード指数を解析・一覧表示するツールです。 |
| index13.html | ChatGPTまたはGeminiを使い、入力した文章をストリーミング表示しながら素早く添削するツールです。 |
| index14.html | OpenAI系APIの入力・出力トークン数などから、1リクエストあたりと1か月あたりの料金を試算します。 |
| index15.html | Gemini APIのモデル別料金を日本円で計算し、1リクエストあたりと1か月あたりの費用を表示します。 |
| index16.html | HTMLコードをURLに埋め込み、表示用URLやコード復元用URLとして共有するツールです。 |
| index17.html | 未完了・作業済みのタスクを管理し、現在の状態をURLやダウンロードファイルとして残します。 |
| index18.html | その日の作業内容を未完了・作業済みに分けて記録し、URLやファイルとして出力する作業報告ツールです。 |
| index19.html | index18.htmlの派生版です。本日のメイン作業を独立して入力できるようにしています。 |
| index20.html | PDFをドラッグ＆ドロップし、各ページをPNG画像とTXTテキストに分解してZIPで出力します。 |
| index21.html | 参拝をテーマにした演出ページです。祈願メッセージを順番に表示し、1日1回実行した状態をIndexedDBに記録します。 |
| index22.html | ChatGPTまたはGeminiで文章を添削し、差分表示と保存を行うProofread Diff Studioです。 |
| index23.html | URLとクエリパラメータを登録し、同じタブまたは新しいタブで開ける補助URLビルダーです。IndexedDB保存とエクスポートに対応しています。 |
| index24.html | ホロカのねねデッキについて、カード内訳と通販購入時の費用をまとめた資料ページです。 |
| index25.html | IndexedDBへ文章を自動保存し、Ctrl+Sで保存・テキストダウンロードできる文章作成補助ツールです。 |
| index26.html | 入力欄にUndo・Redoボタンを備えた、履歴操作確認用の入力ページです。 |
| index27.html | 画像上に番号付きの指示マーカーを配置し、各番号の説明を編集してJSONやPNGとして出力する指示書作成ツールです。 |
| index28.html | よく使うボタンや入力部品をカード形式で確認し、カード内の要素をコピーできる簡易版の早見表です。 |
| index29.html | マウスオーバーやフォーカスで補足を表示する丸いツールチップボタンの旧版サンプルです。CSS・HTML・JavaScriptを個別にコピーできます。 |
| index30.html | 淡い背景、白いカード、影、青緑アクセントなどの見た目を確認するためのダミーUIサンプルです。 |
| index31.html | よく使うHTML部品を、貼り付けてそのまま使いやすい形で全体コピーできる正式版の早見表です。 |
| index32.html | index29.htmlの新版にあたる、補足ツールチップ丸ボタンのサンプルです。 |
| index33.html | さまざまなボタン・操作部品を見比べ、クリックして最小構成のHTMLをコピーするボタン見本市です。 |
| index34.html | 複数人・グループの競馬回収率を管理するトラッカーです。IndexedDB保存、JSON入出力、URL共有、対戦表に対応しています。 |
| index35.html | メッセージ作成アシスタントなどで使える、公開用オプション設定UIのデザインバリエーションを比較するページです。 |
| index36.html | Markdown文章を圧縮してURLに埋め込み、URLを開いた相手が読みやすい文章として表示できる共有ツールです。 |
| index37.html | 会議や出発などの予定を登録し、現在からあと何分かを確認するタイマーツールです。 |
| index38.html | 競馬の印・馬番・理由を入力し、印の強い順に整理した共有URLを作成するツールです。馬名は任意入力です。 |
| index39.html | index38.htmlと同系統の競馬印共有ツールです。馬名を含む入力項目と表示を調整した派生版です。 |
| index40.html | ボタン見本市の別バージョンです。実用的な操作ボタンを確認し、部品単位のHTMLをコピーできます。 |
| index41.html | 欲しいものをグループ分けして管理するリストです。個数変更、並び替え、検索、完了項目の削除、リアルタイム保存に対応しています。 |
| index42.html | ChatGPTやGeminiに新規HTML作成・既存サイト編集を依頼するためのプロンプトを、入力内容から組み立てるツールです。 |
| index43.html | ボタン見本市の拡張版です。保存・比較・候補表示など、さまざまな用途のボタンデザインを確認できます。 |
| index44.html | netkeibaの出馬表を貼り付け、競馬の印が強い順に見解を入力・共有するツールです。 |
| index45.html | 濃い色ややや薄い濃色のボタンを中心に確認できる、ボタン見本市のデザイン派生版です。 |
| index46.html | スマートフォンでの文章編集を補助します。カーソルの前後削除、連続空行の整理、全文コピーなどに対応しています。 |
| index47.html | 文章の文字数、行数、バイト数などをリアルタイム表示する文字数カウンターです。コピーとTXT保存にも対応しています。 |
| index48.html | CSS光沢ボタンの装飾を要素ごとに分解し、説明と該当CSSを確認できる学習用サンプルです。 |
| index49.html | HTMLと複数のCSSから指定したclass・idなどのセレクタを探し、関連するCSSを統合して出力するツールです。 |
| index50.html | 遊戯王カードのAmazon商品情報を登録・検索するサイトを作成するための管理ツールです。IndexedDB保存、JSONバックアップ、検索サイト出力に対応しています。 |
| index51.html | Enterキーによる誤送信を避けながらChatGPT向け文章を作成し、整形・保存・コピー・ChatGPT起動を行う入力補助です。 |
| index52.html | index51.htmlのGemini向け版です。Geminiに送る文章の整形、保存、コピー、起動を補助します。 |
| index53.html | 単一HTMLをドラッグ＆ドロップし、安全版または挑戦版の自己解凍HTMLへ圧縮するツールです。 |
| index54.html | gzip圧縮されたデータを内部に持つ、自己解凍HTMLの生成物・検証用ファイルです。 |
| index55.html | 単一HTMLを自己解凍形式へ変換するHTML圧縮ツールの別版です。生バイナリ版とBase64版を比較して短い出力を採用します。 |
| index56.html | 入力文章からChatGPT向けの敬語変換プロンプトを作成するツールです。変換タイプを選択して結果をコピーできます。 |
| index57.html | GLB、GLTF、OBJ、FBXをブラウザ上で表示する3Dモデルプレビューアです。テクスチャ、カメラ操作、ワイヤーフレーム、画像保存に対応しています。 |
| index58.html | 複数動画を順番に解析し、黒画面区間を検出して一覧化するブラウザ内ツールです。CSV保存と結果コピーに対応しています。 |
| index59.html | Google AI Plusの料金改定、機能、無料版との差、プライバシー運用差を出典付きで整理した調査資料です。 |
| index60.html | HTMLをブラウザ内で暗号化し、単体で開ける保護ページとして出力するLocal HTML Lockerの基本版です。 |
| index61.html | Local HTML Lockerに、Base62パスワード自動生成、禁止ワード確認、容量節約用gzip圧縮などを加えた版です。 |
| index62.html | Local HTML Lockerに、解除パスワード情報のダウンロードと、成功したパスワードのIndexedDB記憶機能を加えた版です。 |
| index63.html | Local HTML Lockerの派生版です。解除パスワードの記憶を初期状態で無効にし、共有端末での利用を意識した設定になっています。 |
| index64.html | Local HTML Lockerの派生版です。生成ごとのランダムな保存用秘密値を使い、解除パスワード記憶の保存先を生成物ごとに分ける構成です。 |
| index65.html | Local HTML Lockerに、生成ページへキャッシュ抑制用のmetaタグを追加する設定を加えた版です。 |
| index66.html | Local HTML Lockerに、元HTMLのJavaScriptを分離して2段階で扱う機能と、暗号化なしで生成する選択肢を加えた版です。 |
| index67.html | HTML Hiddener系の派生版です。JavaScriptやCSSの分離、HTML解析を難しくするための処理を含み、暗号化なしの生成が初期選択されています。 |
| index68.html | HTML Hiddener系の別派生版です。暗号化を初期選択に戻し、生成物に追加データを持たせる検証処理を含みます。 |
| index69.html | URLと説明を登録してQRコード化するツールです。QR生成、カメラ撮影、専用表示の3画面に対応しています。 |
| index70.html | スマートフォンを順番に回して遊ぶ、戦績保存対応のパーティゲーム for ワンナイト人狼です。 |
| index71.html | URLを共有リンクへ変換するツールです。共有画面から外す項目、キャッシュなし表示、Wayback Machine、QR表示などを設定できます。 |
| index72.html | 普通の文章を入力し、読みやすい閲覧用ページとして単体HTMLに保存するツールです。 |
| index73.html | Markdownをnoteへ貼り付けやすい形式に変換し、プレビューを見ながらコピーするツールです。 |
| index74.html | スマートフォンを順番に回して遊ぶ、4〜20人対応の正体隠匿ゲーム「消えた招待客」です。 |
| index75.html | Markdown文章を読みやすい閲覧用HTMLとして保存する日本語版ツールです。特記事項の編集にも対応しています。 |
| index76.html | Google Playコードの入力を補助するツールです。数字を画面上のボタンから入力し、コード単位でコピーできます。 |
| index77.html | ボタン見本市の日本語版派生ファイルです。部品の検索・表示・コピーを行えます。 |
| index78.html | index77.htmlと同系統の、英語表示によるButton Showcaseです。 |
| index79.html | Markdownを読みやすい英語の単体HTMLへ変換し、保存・編集・プレビューするツールです。 |
| index80.html | Markdown文章を閲覧用HTMLとして保存する版です。文字数表示、特記事項編集、保存後の再編集に対応しています。 |
| index80_explanation.html | index80.htmlにMarkdownの簡易説明文をあらかじめ埋め込んだ、説明・サンプル用のファイルです。 |
| index81.html | 画像をWebPへ段階圧縮し、元画像との見た目・サイズ・Data URL文字数を比較するツールです。 |
| index82.html | index80.html系の閲覧用HTML作成ツールに、写真採点の機械的な点数調整を説明するMarkdown資料を埋め込んだサンプルです。 |
| index83.html | 複数のHTML・JSファイルから関数やメソッドの定義と呼び出し関係を簡易解析し、一覧とグラフで表示します。 |
| index84.html | HTMLを本体とJavaScriptに分けて圧縮・AES-GCM暗号化し、自動復号型のHTMLを生成する検証ツールです。完全な秘匿を目的とするものではありません。 |
| index85.html | プロフィール写真をAIで評価し、総合点、7項目評価、第一印象、改善順、撮影方法などを表示する写真診断ツールの旧版です。 |
| index86.html | index85.htmlの更新版です。写真の用途、7項目の詳細評価、レーダーチャート、改善アドバイスなどの表示を拡張しています。 |
| index87.html | 写真アップロードUIのCSS・HTML・JavaScriptを個別または一括でコピーできる紹介・生成ツールです。クラス名や案内文も変更できます。 |
| index88.html | HTMLをドラッグ＆ドロップし、AES-GCMで簡易暗号化した単体HTMLとして保存するローカルツールです。 |
| index88_sample.html | index88.htmlが生成する暗号化HTMLの読み込み・復号部分を確認するためのサンプル出力です。 |
| index89.html | Markdown表をPNG画像に変換し、画像の余白へ元Markdownと設定を埋め込んで再編集できるツールです。 |
| index90.html | 文章・コード・画像をChatGPTへ貼り付けやすく整理するTokenTrimの旧版です。空白圧縮や画像のWebP化を行います。 |
| index91.html | ChatGPTに画像のおすすめトリミング案をJSONで出してもらい、その案をブラウザ上で実際に切り出す補助ツールです。 |
| index92.html | TokenTrimの新版です。文章・コードの機械的な圧縮と画像のWebP化をまとめて行い、ChatGPT送信用の文章を作成します。 |
| index93.html | 正規表現をUTF-8 Base64へ変換し、指定言語で復号して変数へ代入するコードを生成するツールです。 |
| index94.html | 複数セクションのMarkdownを編集し、自動目次付きの閲覧・印刷用HTMLとして保存する資料作成ツールです。 |
| index94_sample.html | index94.htmlに新入社員向け情報セキュリティ資料のサンプルセクションを埋め込んだ出力例です。 |
| index95.html | 迷路の画面遷移で、前画面を画像として保持し、円形ワイプで次の画面を見せるアニメーションデモです。 |

## ルート直下の検証・出力・補助ファイル

| ファイル | 紹介 |
| --- | --- |
| ChatGPT_Test.html | GPT-5-nanoなどのモデルをブラウザから試すデバッグ用ページです。APIキー、モデル切替、IndexedDB保存の動作を確認できます。 |
| Test1.html | IndexedDB保存、名前・グループ管理、JSON入出力、URL共有、対戦表に対応した競馬回収率トラッカーの別保存版です。 |
| test1.html | 補足ツールチップ丸ボタンの単体テスト用HTMLです。ポップオーバー対応や画面端での位置調整を確認できます。 |
| a3_trump_20up_template.html | A3用紙にトランプ20枚を配置して印刷するためのテンプレートです。 |
| sample1.html | 文章から閲覧用サイトを作成するツールのサンプル出力です。ChatGPT API料金シミュレーターの紹介文が埋め込まれています。 |
| locked-page.html | パスワード入力と解除用ファイルに対応した、Private Page形式の保護ページの検証用出力です。 |
| locked-page2.html | locked-page.html系の派生版です。保護ページの復号処理や解除用ファイルの扱いを確認できます。 |
| locked-page3.html | API料金シミュレーターの内容を自動復元する、圧縮・保護ページ用の検証出力です。 |
| locked-page4.html | API料金シミュレーターの保存・出力テストに使う別版HTMLです。 |
| locked-page5.html | API料金シミュレーターの保存・出力テストに使う別レイアウト版HTMLです。 |
| locked-page (11).html | API料金シミュレーターを埋め込んだ、パスワード解除型の保護ページ出力です。 |
| locked-page (12).html | Undo・Redo入力サイトを埋め込んだ、パスワード解除型の保護ページ出力です。 |
| index54.htmlとlocked-page系 | 生成ツールで作られた自己解凍・保護HTMLの検証用ファイルです。一般公開用の入口というより、生成結果の確認に使うファイル群です。 |
| batu2.js | 広告らしいid・classの要素を非表示にし、外部リンクや広告らしいボタンなどを押す前に確認を表示するユーザースクリプトです。 |
| LICENSE | リポジトリ内ソフトウェアに適用するMITライセンスです。 |
| OUTPUT-RIGHTS.md | 本リポジトリのツールで利用者が作成した成果物について、開発者が成果物自体の権利を主張しない意向を補足します。第三者素材や契約上の権利は別途確認が必要です。 |
| README.md | リポジトリの概要と、主要な公開ページへのリンクをまとめた現在のREADMEです。 |
| _config.yml | GitHub Pages向けのJekyll設定です。サイトマップ用プラグインを指定しています。 |

## HTMLHiddenerLite

| ファイル | 紹介 |
| --- | --- |
| HTMLHiddenerLite/README | Qiita記事へのリンクと、HTMLへプラグインを読み込む方法を説明するREADMEです。 |
| HTMLHiddenerLite/ver1.0.0.js | 保存前にCSSをadoptedStyleSheetsへ移し、style・stylesheet・script・インラインイベントなどをDOMから除去する軽量プラグインです。HTMLの解析を難しくするためのもので、完全な保護や機能維持を保証するものではありません。 |

## Plugin

### 説明・テスト用ファイル

| ファイル | 紹介 |
| --- | --- |
| Plugin/README | plugin1.js〜plugin7.jsの用途、読み込み方法、テストページをまとめたプラグインREADMEです。 |
| Plugin/TestYou/MyTest | プラグイン検証用の空に近いHTMLテスト台です。 |
| Plugin/TestYou/Test1.html | plugin1.jsの画像右クリック禁止・ドラッグ抑制を確認するテストページです。 |
| Plugin/TestYou/Test1.png | Test1.htmlで使用する画像テスト用PNGです。 |
| Plugin/TestYou/Test5.html | plugin5.jsのcopy-text要素を確認するテストページです。 |
| Plugin/TestYou/Test6.html | plugin6.jsのMarkdown風表示、リンク、リスト、コードブロック、コピー機能を確認するテストページです。 |
| Plugin/TestYou/Test10A.html | plugin10.jsの画面遷移デモの開始画面です。次の画面へ進む前の状態を画像として保持します。 |
| Plugin/TestYou/Test10B.html | plugin10.jsの画面遷移デモの到着画面です。保持した前画面を円形に透明化して到着画面を表示します。 |
| Plugin/TestYou/Plugin9Test/index.html | plugin9.jsのhtml-part部品読み込みを確認する親ページです。 |
| Plugin/TestYou/Plugin9Test/panel/panel.html | html-partで読み込まれるパネル部品です。さらにbutton.htmlを読み込みます。 |
| Plugin/TestYou/Plugin9Test/panel/button/button.html | panel.htmlから読み込まれるボタン部品です。クリック結果の表示と部品内スクリプトを確認できます。 |

### JavaScriptプラグイン

| ファイル | 紹介 |
| --- | --- |
| Plugin/plugin1.js | 画像の選択・ドラッグ・長押しメニューなどを抑制する簡易画像ガードです。 |
| Plugin/plugin2.js | Viaなどで使うことを想定した、ページ全体をクリーム色背景と黒文字中心の表示へ寄せるスタイル注入スクリプトです。 |
| Plugin/plugin3.js | 入力欄にフォーカスしたとき、コピー・削除・範囲選択指定の補助ボタンを表示する入力作業支援スクリプトです。 |
| Plugin/plugin4.js | via_inject_blocker.cssなど特定名のCSS挿入を検出し、可能な範囲で無効化するガードです。サイト仕様への影響や非対応の可能性があります。 |
| Plugin/plugin5.js | copy-text classを付けた文字をクリックでコピーし、コピー完了表示を出すプラグインです。data-copy-textによる別コピー内容にも対応します。 |
| Plugin/plugin6.js | md-box内の文章をMarkdown風に描画し、見出し、強調、リスト、引用、リンク、コードブロック、コピー操作を提供するプラグインです。 |
| Plugin/plugin7.js | jm-to-対象名形式のclassを付けた要素から、idまたはclassで指定した位置へスクロールするジャンプマーカープラグインです。 |
| Plugin/plugin8.js | 外部画像・CSS・JavaScript・フォントなどを可能な範囲でData URLへ埋め込み、一時Blob URLへ移すDOM Source Cleanerです。ソース解析の手間を増やす目的であり、秘密保持機能ではありません。 |
| Plugin/plugin9.js | html-part要素のsrcに指定したHTML部品を読み込み、相対URLを書き換え、部品内のスクリプトも実行するWeb Components風ローダーです。 |
| Plugin/plugin10.js | 現在のページを画像として保持し、次のページをクリック位置から円形マスクで表示する画面遷移プラグインです。低メモリ端末や視差効果を減らす設定にも配慮しています。 |
| Plugin/batu1.js | 小説家になろう系ページの本文らしい部分を検出し、右下のボタンからブラウザ音声合成で読み上げるユーザースクリプトです。 |

## SafariCopyShortcut

| ファイル | 紹介 |
| --- | --- |
| SafariCopyShortcut/index.html | Safari本文コピーショートカットのダウンロード方法、追加方法、使い方を説明する案内ページです。 |
| SafariCopyShortcut/SafariTextCopy.shortcut | Safariで表示中のWebページ本文をJavaScriptで取得し、クリップボードへコピーして通知するAppleショートカット本体です。 |
| SafariCopyShortcut/txt.txt | SafariTextCopy.shortcutと同じショートカット定義を、確認・編集しやすいテキスト形式で保存したファイルです。 |

## ai-folder-editor

| ファイル | 紹介 |
| --- | --- |
| ai-folder-editor/README.md | AI Folder Editorの起動方法、使い方、ChatGPT用パッチの反映手順を説明するREADMEです。 |
| ai-folder-editor/index.html | フォルダ内のテキストファイルを開き、AI反映パネルから依頼や差分を適用するWebアプリの画面です。 |
| ai-folder-editor/exp.html | AI Folder Editorの目的、基本操作、プロンプト生成の流れを説明する案内ページです。 |
| ai-folder-editor/app.js | フォルダ選択、ファイルツリー表示、テキスト編集、ChatGPT用プロンプト生成、差分パッチ解析・反映を担当するメインスクリプトです。 |
| ai-folder-editor/styles.css | AI Folder Editorの配色、レイアウト、エディタ、差分表示、反映パネルを定義するスタイルです。 |
| ai-folder-editor/server.mjs | ローカル環境でai-folder-editorを配信するNode.jsの簡易HTTPサーバーです。 |
| ai-folder-editor/python.err.log | 実行時のPython標準エラー出力を保存するログファイルです。現在は空です。 |
| ai-folder-editor/python.out.log | 実行時のPython標準出力を保存するログファイルです。現在は空です。 |
| ai-folder-editor/server.err.log | ローカルサーバーの標準エラー出力を保存するログファイルです。現在は空です。 |
| ai-folder-editor/server.out.log | ローカルサーバーの標準出力を保存するログファイルです。現在は空です。 |

## gmail-suspicion-extension

| ファイル | 紹介 |
| --- | --- |
| gmail-suspicion-extension/README.md | Gmail Suspicion Meterのインストール方法、AI判定、解析済みメールの記憶仕様、注意事項を説明するREADMEです。 |
| gmail-suspicion-extension/manifest.json | Gmail上で動作するManifest V3 Chrome拡張の権限、サービスワーカー、コンテンツスクリプトを定義します。 |
| gmail-suspicion-extension/background.js | 拡張機能アイコンからGmailを開く、またはGmail上の判定パネルを表示するサービスワーカーです。 |
| gmail-suspicion-extension/content.js | Gmailのメール一覧を読み取り、AI判定用プロンプトの生成、ChatGPT・Geminiへの遷移、結果の貼り付け、圧縮記憶、怪しさパーセント表示を担当します。 |
| gmail-suspicion-extension/content.css | Gmail上に表示する怪しさ表示と判定パネルのレイアウト・配色を定義します。 |

## novel-shelf-extension

| ファイル | 紹介 |
| --- | --- |
| novel-shelf-extension/README.md | 小説棚のインストール方法、対応サイト、取得方法、ローカルJSON同期、利用上の注意を説明するREADMEです。 |
| novel-shelf-extension/manifest.json | 小説サイトへのコンテンツスクリプト注入、サイドパネル、保存権限、Ctrl+Shift+Yショートカットを定義するManifest V3設定です。 |
| novel-shelf-extension/background.js | 作品単位の保存インデックス、設定、ページ本文の保存、JSON出力フォルダとの同期、サイドパネル連携を担当します。 |
| novel-shelf-extension/content-script.js | 対応する小説サイトの本文、作品名、ページ名、URL、ページ番号を検出してバックグラウンドへ送信します。 |
| novel-shelf-extension/panel.html | 保存した小説の一覧、作品選択、閲覧HTML出力、JSON出力、保存フォルダ設定を表示するサイドパネルです。 |
| novel-shelf-extension/panel.css | 小説棚サイドパネルのライトテーマ、一覧、ボタン、状態表示を定義します。 |
| novel-shelf-extension/panel.js | サイドパネルの一覧表示、作品選択、JSON同期、閲覧HTML生成、設定操作を担当します。 |
| novel-shelf-extension/reader-template.js | 保存した作品データをJSONやオフライン閲覧用HTMLへ変換し、HTMLエスケープや安全なファイル名生成も行います。 |
| novel-shelf-extension/novel-shelf-extension.zip | novel-shelf-extensionをChromeへ読み込むためにまとめたZIPアーカイブです。 |

## ライセンスと利用上の注意

ソースコードはLICENSEのMITライセンスに従います。ツールで作成した文章・画像・コードなどの成果物についてはOUTPUT-RIGHTS.mdを確認してください。入力内容や出力内容に第三者の著作権・商標権・プライバシー権などが関係する場合は、利用者自身で権利関係を確認してください。

HTMLの暗号化・難読化・解析抑制を目的とするファイルは、ブラウザ上で表示・実行する必要があるため、完全な秘匿を保証するものではありません。重要な情報の保護には、適切な認証・サーバー側アクセス制御・暗号鍵管理を利用してください。
