"use strict";
// 文字組みの切り替え。[id, 表示名]。文字の大きさと書体は variant.css の [data-type] に定義する
window.VARIANT = { attr: "data-type", label: "文字", options: [
  ["gothic13", "ゴシック 13px"],
  ["mincho", "見出しだけ明朝"],
  ["dense12", "12px 高密度"],
] };
