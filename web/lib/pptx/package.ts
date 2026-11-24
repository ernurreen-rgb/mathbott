/**
 * The parts every .pptx needs besides its slides: content types, relationships, the presentation,
 * one theme, one slide master and one blank layout. Written by hand so the slides can carry
 * PowerPoint equations (OMML), which no slide library writes.
 */
import { escapeXml } from "./latex-omml";

export const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  m: "http://schemas.openxmlformats.org/officeDocument/2006/math",
  a14: "http://schemas.microsoft.com/office/drawing/2010/main",
  mc: "http://schemas.openxmlformats.org/markup-compatibility/2006",
} as const;

const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** 16:9 slide, 13.333 × 7.5 in, as PowerPoint's "Widescreen". */
export const SLIDE_WIDTH = 12192000;
export const SLIDE_HEIGHT = 6858000;
export const EMU_PER_INCH = 914400;

export type MediaExtension = "png" | "jpeg";

export interface PackageSlide {
  /** The slide's XML, from <p:sld> on. */
  xml: string;
  /** Relationship ids rId2.. point at these media files (rId1 is the layout). */
  media: string[];
}

export interface PackageInput {
  title: string;
  author: string;
  slides: PackageSlide[];
  /** File name in ppt/media → bytes. */
  media: Map<string, Uint8Array>;
}

const contentTypes = (slideCount: number) => XML_HEAD
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Default Extension="png" ContentType="image/png"/>'
  + '<Default Extension="jpeg" ContentType="image/jpeg"/>'
  + '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
  + '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
  + '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
  + '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
  + '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>'
  + '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>'
  + '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>'
  + Array.from({ length: slideCount }, (_, index) =>
    `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")
  + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
  + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
  + "</Types>";

const rootRels = XML_HEAD
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/>`
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
  + `<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/>`
  + "</Relationships>";

function coreProps(title: string, author: string) {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  return XML_HEAD
    + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
    + 'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
    + 'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:title>${escapeXml(title)}</dc:title><dc:creator>${escapeXml(author)}</dc:creator>`
    + `<cp:lastModifiedBy>${escapeXml(author)}</cp:lastModifiedBy>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>`
    + `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>`
    + "</cp:coreProperties>";
}

const appProps = (slideCount: number) => XML_HEAD
  + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
  + 'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
  + `<Application>QazMath</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${slideCount}</Slides>`
  + "</Properties>";

function presentation(slideCount: number) {
  const slideIds = Array.from({ length: slideCount }, (_, index) =>
    `<p:sldId id="${256 + index}" r:id="rId${index + 3}"/>`).join("");
  return XML_HEAD
    + `<p:presentation xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}" saveSubsetFonts="1">`
    + '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
    + `<p:sldIdLst>${slideIds}</p:sldIdLst>`
    + `<p:sldSz cx="${SLIDE_WIDTH}" cy="${SLIDE_HEIGHT}"/>`
    + '<p:notesSz cx="6858000" cy="9144000"/>'
    + "</p:presentation>";
}

function presentationRels(slideCount: number) {
  const slides = Array.from({ length: slideCount }, (_, index) =>
    `<Relationship Id="rId${index + 3}" Type="${REL}/slide" Target="slides/slide${index + 1}.xml"/>`).join("");
  const next = slideCount + 3;
  return XML_HEAD
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + `<Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`
    + `<Relationship Id="rId2" Type="${REL}/theme" Target="theme/theme1.xml"/>`
    + slides
    + `<Relationship Id="rId${next}" Type="${REL}/presProps" Target="presProps.xml"/>`
    + `<Relationship Id="rId${next + 1}" Type="${REL}/viewProps" Target="viewProps.xml"/>`
    + `<Relationship Id="rId${next + 2}" Type="${REL}/tableStyles" Target="tableStyles.xml"/>`
    + "</Relationships>";
}

const presProps = XML_HEAD + `<p:presentationPr xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"/>`;
const viewProps = XML_HEAD
  + `<p:viewPr xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}">`
  + '<p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr>'
  + '<p:gridSpacing cx="76200" cy="76200"/></p:viewPr>';
const tableStyles = XML_HEAD
  + `<a:tblStyleLst xmlns:a="${NS.a}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`;

const SCHEME_COLORS = [
  ["dk1", '<a:sysClr val="windowText" lastClr="000000"/>'],
  ["lt1", '<a:sysClr val="window" lastClr="FFFFFF"/>'],
  ["dk2", '<a:srgbClr val="1F2937"/>'],
  ["lt2", '<a:srgbClr val="F1F5F9"/>'],
  ["accent1", '<a:srgbClr val="2436AE"/>'],
  ["accent2", '<a:srgbClr val="4F6BED"/>'],
  ["accent3", '<a:srgbClr val="16A34A"/>'],
  ["accent4", '<a:srgbClr val="F59E0B"/>'],
  ["accent5", '<a:srgbClr val="DC2626"/>'],
  ["accent6", '<a:srgbClr val="7C3AED"/>'],
  ["hlink", '<a:srgbClr val="2436AE"/>'],
  ["folHlink", '<a:srgbClr val="7C3AED"/>'],
];

const theme = XML_HEAD
  + `<a:theme xmlns:a="${NS.a}" name="QazMath">`
  + '<a:themeElements>'
  + `<a:clrScheme name="QazMath">${SCHEME_COLORS.map(([name, value]) => `<a:${name}>${value}</a:${name}>`).join("")}</a:clrScheme>`
  + '<a:fontScheme name="QazMath">'
  + '<a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface="Arial"/></a:majorFont>'
  + '<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface="Arial"/></a:minorFont>'
  + '</a:fontScheme>'
  + '<a:fmtScheme name="QazMath">'
  + '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
  + '<a:solidFill><a:schemeClr val="phClr"><a:tint val="50000"/></a:schemeClr></a:solidFill>'
  + '<a:solidFill><a:schemeClr val="phClr"><a:shade val="80000"/></a:schemeClr></a:solidFill></a:fillStyleLst>'
  + '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
  + '<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
  + '<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
  + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>'
  + '<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
  + '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
  + '<a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/></a:schemeClr></a:solidFill>'
  + '<a:solidFill><a:schemeClr val="phClr"><a:shade val="90000"/></a:schemeClr></a:solidFill></a:bgFillStyleLst>'
  + '</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';

const EMPTY_TREE = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
  + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';

const levelStyle = (size: number) =>
  '<a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">'
  + `<a:defRPr sz="${size}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill>`
  + '<a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>';

const slideMaster = XML_HEAD
  + `<p:sldMaster xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}">`
  + `<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${EMPTY_TREE}</p:cSld>`
  + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" '
  + 'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
  + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
  + '<p:txStyles>'
  + `<p:titleStyle>${levelStyle(4000)}</p:titleStyle>`
  + `<p:bodyStyle>${levelStyle(2400)}</p:bodyStyle>`
  + `<p:otherStyle>${levelStyle(1800)}</p:otherStyle>`
  + "</p:txStyles></p:sldMaster>";

const slideMasterRels = XML_HEAD
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + `<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`
  + `<Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/>`
  + "</Relationships>";

const slideLayout = XML_HEAD
  + `<p:sldLayout xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}" type="blank" preserve="1">`
  + `<p:cSld name="Blank">${EMPTY_TREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const slideLayoutRels = XML_HEAD
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + `<Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>`
  + "</Relationships>";

function slideRels(media: string[]) {
  return XML_HEAD
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + `<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`
    + media.map((name, index) =>
      `<Relationship Id="rId${index + 2}" Type="${REL}/image" Target="../media/${name}"/>`).join("")
    + "</Relationships>";
}

/** Every file of the package, path → content. Zip it to get the .pptx. */
export function buildPackageFiles(input: PackageInput): Map<string, string | Uint8Array> {
  const count = input.slides.length;
  const files = new Map<string, string | Uint8Array>([
    ["[Content_Types].xml", contentTypes(count)],
    ["_rels/.rels", rootRels],
    ["docProps/core.xml", coreProps(input.title, input.author)],
    ["docProps/app.xml", appProps(count)],
    ["ppt/presentation.xml", presentation(count)],
    ["ppt/_rels/presentation.xml.rels", presentationRels(count)],
    ["ppt/presProps.xml", presProps],
    ["ppt/viewProps.xml", viewProps],
    ["ppt/tableStyles.xml", tableStyles],
    ["ppt/theme/theme1.xml", theme],
    ["ppt/slideMasters/slideMaster1.xml", slideMaster],
    ["ppt/slideMasters/_rels/slideMaster1.xml.rels", slideMasterRels],
    ["ppt/slideLayouts/slideLayout1.xml", slideLayout],
    ["ppt/slideLayouts/_rels/slideLayout1.xml.rels", slideLayoutRels],
  ]);
  input.slides.forEach((slide, index) => {
    files.set(`ppt/slides/slide${index + 1}.xml`, XML_HEAD + slide.xml);
    files.set(`ppt/slides/_rels/slide${index + 1}.xml.rels`, slideRels(slide.media));
  });
  input.media.forEach((bytes, name) => files.set(`ppt/media/${name}`, bytes));
  return files;
}
