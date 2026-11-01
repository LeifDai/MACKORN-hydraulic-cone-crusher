# ai_execute.php 修复部署说明 · 2026-11-01 23:10

## 一、好消息：文件传上去了

`IT 经理传完了` —— 实测确认 ✅

```
https://mackorn.cn/ai/api/ai_execute.php
  200  510ms  ?action=help       ✅
  200  162ms  ?action=catalog    ✅
  200   68ms  ?action=specs      ✅
  200   72ms  ?action=capacity   ✅
  200   68ms  ?action=recommend  ✅
  200   76ms  ?action=materials  ✅
  200   73ms  ?action=liner      ✅
```

**7 个端点全部 200，Dify/Coze 要求的 `{"response":"<JSON字符串>"}` 包裹格式正确。**

---

## 二、但发现一个必须修的 Bug（否则 bauma 展会上会丢脸）

### 现象

```
action=catalog  →  返回 13 个机型 ✅
                  NH200, NH300, NH400, NH600, NH700, NH860, NH865,
                  NH890, NH895, NS200, NS300, NS400, NS600

action=specs&model=NH890  →  🔴 MODEL_NOT_FOUND
action=specs&model=NH600  →  🔴 MODEL_NOT_FOUND
action=capacity&model=NH890&css=25  →  🔴 MODEL_NOT_FOUND
```

### 根因

```php
// 原代码：死板只查 CAVITY_CAPACITY（深度库，只有 3 个机型）
if (!isset($DB['CAVITY_CAPACITY'][$model])) {
    out(['status'=>error, 'error'=>'MODEL_NOT_FOUND', ...]);
}
```

- `CAVITY_CAPACITY` = 深度库，**只有 NH200 / NH300 / NH400**（逐腔型 × CSS 的二维产能表）
- `ALL_MODELS` = 基础库，**13 个机型都有**（功率 / 最大给料 / CSS 范围 / 重量 / 产能区间）

**⇒ `specs` 没在深度库找到就直接报错，没去基础库兜底。**

### 数据本身是对的（这点很关键）

服务器 `ALL_MODELS` 里的 NH890：

```json
{
  "model": "NH890",
  "maxFeedMm": 370,
  "cssMin": 16,
  "cssMax": 70,
  "powerKw": 750,
  "weightKg": 76100,
  "capacityTph": [503, 2436]
}
```

**全部正确** —— 750 kW / 503-2436 t/h / 370 mm / 16-70 mm / 76.1 t。
和 MACKORN 插件、和我在 PDF 里用的值完全一致。

**⇒ 只是「取不出来」，不是「数据错」。**

---

## 三、已经修好了

### 改了什么

**① `action=specs` 加回退**

```php
if (!isset($DB['CAVITY_CAPACITY'][$model])) {
    $baseRow = findModelRow($DB, $model);
    if ($baseRow !== null) {
        out([
            'status'  => 'success',
            'model'   => $model,
            'base'    => $baseRow,
            'basis'   => 'APPROX',        // ★ 明确标注
            'capacity_range_tph' => $baseRow['capacityTph'],
            'css_range_mm'       => [$baseRow['cssMin'], $baseRow['cssMax']],
            'note' => '该机型无腔型×CSS 详表，此处返回系列区间；具体工况需向 MACKORN 确认',
        ], [...]);
    }
    // 真的不存在才报 MODEL_NOT_FOUND
}
```

**② `action=capacity` 同样回退 + 线性外推**

```php
$ratio = ($css - $cMin) / ($cMax - $cMin);
$rated = $tph[0] + ($tph[1] - $tph[0]) * $ratio;
// 并标注 'basis' => 'APPROX（系列区间在 CSS 16-70mm 上线性外推）'
```

**③ 版本号 0.2.2 → 0.2.3**

### 为什么标注 APPROX 很重要

```
MACKORN 插件对 NH890 的原始说明：
  「无 NH890 腔型×CSS 详表，按系列区间 503-2436 t/h 在 CSS 16-70mm 上线性外推（近似）」

⇒ PDF 里、API 里都必须这样标。
    不能把外推值包装成实测值 —— 这是 10-31 那次「伪造参数」事故的教训。
```

---

## 四、要 IT 做的事（1 个文件，2 分钟）

### 上传这两个文件之一

| 用途 | 文件 |
|:---|:---|
| **新版（要传的）** | `distribution\ai_execute-0.2.3-待上传.php` （18.3 KB） |
| **回滚版（万一报错）** | `distribution\ai_execute-回滚版.php` （14.9 KB，就是当前服务器上那个） |

**目标路径**：`htdocs/ai/api/ai_execute.php`（覆盖同名文件）

### 上传后立刻验证（我来跑，或 IT 自己跑）

```powershell
cd "D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"
node tools\verify_ai_pack.mjs --live
```

**期望**：`线上：8/8 通过`（现在是 7/8，Q6 材料表也不足）

### 如果上传后报 500 / 白屏

**立刻传回 `ai_execute-回滚版.php`** —— 那是当前能用的版本。

---

## 五、我已经做的安全措施

| 措施 | 说明 |
|:---|:---|
| ✅ 原文件备份 | `ai_execute.php.bak-20261101` |
| ✅ 括号配平校验 | 39 个 `{` / 39 个 `}`，全部配平 |
| ✅ 字符串剥离后校验 | 去掉字符串和注释再数括号，排除 `"{"` 这类干扰 |
| ✅ 关键函数存在性 | `out` / `findModelRow` / `param` / `normModel` 全在 |
| ✅ 末行完整性 | 以 `]);` 结尾，没被截断 |
| ✅ 补丁标记检查 | `APPROX` / 线性外推注释都在 |
| ⚠️ **无法做的** | 本机没有 `php.exe`，不能做真正的 `php -l` 语法检查 |

**⇒ 所以策略是「先传后验 + 秒回滚」。传完第一件事就是测 `?action=help`，200 且有 `response` 包裹 = 语法 OK。**

---

## 六、修完的预期效果

```
改前：
  Q: NH890 的参数是多少？
  A: 找不到该型号 ❌

改后：
  Q: NH890 的参数是多少？
  A: NH890 是单缸液压圆锥破，750 kW，产能 503-2436 t/h，
     最大给料 370 mm，排矿口 16-70 mm，整机重 76.1 t。
     （注：该机型暂无逐腔型产能表，以上为系列区间）
  ✅ 而且诚实标注了数据等级
```

**bauma 展会上客户在 AI 里问「NH890」时，不会再说「找不到型号」。**

---

## 七、顺便：后台在跑的事

```
批量官网联系方式抓取（282 个目标，287 个有 MX 的域名）
  速度：35 秒/站
  预计：约 2.7 小时完成（今晚 01:50 左右）
  进度：data/sourcing-progress.json
  成果：data/sourcing-progress.json 里 status=OK 的
  报告：python tools/batch-sourcing.py --report
```

已抓到 4 家（AFAQ Mining / AGF Equipamentos / AIME / AMS Industrial Group）。

---

*2026-11-01 23:10 · 认知 95 条 ｜ 门禁 274/0*
