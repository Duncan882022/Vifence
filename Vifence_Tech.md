# **VIFENCE CMS**

# **TECHNICAL ARCHITECTURE**

Version: 1.0

---

# **OBJECTIVE**

Tài liệu này mô tả tiêu chuẩn kỹ thuật frontend cho toàn bộ hệ thống Vifence CMS.

Mục tiêu:

- Dễ mở rộng
- Dễ bảo trì
- Reuse component
- Hiệu năng tốt
- Đồng nhất toàn hệ thống

---

# **TECH STACK**

Framework

React 19

Language

TypeScript

Build Tool

Vite

Styling

TailwindCSS

UI Library

shadcn/ui

Icons

lucide-react

State Management

Zustand

Table

TanStack Table

Chart

Recharts

Form

React Hook Form

Validation

Zod

Date

dayjs

---

# **PROJECT STRUCTURE**

src/

app/

pages/

modules/

components/

services/

hooks/

store/

types/

utils/

assets/

---

# **MODULE STRUCTURE**

modules/

module01-access-control/

module02-training/

module03-safety/

module04-housekeeping/

module05-productivity/

module06-assets/

module07-inspection/

module08-reporting/

---

# **COMMON COMPONENTS**

components/common/

Sidebar/

Header/

KPICard/

CameraGrid/

CameraCard/

EventList/

PlaybackPanel/

StatusBadge/

SearchBar/

FilterDropdown/

AccordionList/

EmptyState/

LoadingState/

---

# **SIDEBAR**

Single Component

Shared Across All Modules

Width

220px

Never Modified Per Module

---

# **CAMERA SYSTEM**

Single CameraGrid Component

Shared Across Modules

Used By

Module 01

Module 02

Module 03

Module 04

Module 05

---

Supported Layouts

1x1

2x2

4x4

8x8

---

# **PLAYBACK SYSTEM**

Single PlaybackPanel Component

Shared Across Modules

---

Functions

Play

Pause

Seek

Speed

Export

Download

---

# **EVENT SYSTEM**

Single EventList Component

Shared Across Modules

---

Features

Search

Filter

Sort

Pagination

Actions

---

# **STATE MANAGEMENT**

Use Zustand

Avoid Redux

---

Global Store

Auth

Theme

Layout

Notifications

User

---

Module Store

AccessControl

Training

Safety

Housekeeping

Productivity

Assets

Inspection

Reporting

---

# **API STRUCTURE**

services/

auth.service.ts

camera.service.ts

event.service.ts

training.service.ts

safety.service.ts

asset.service.ts

report.service.ts

---

Pattern

Service Layer Only

No Direct API Calls In Components

---

# **TYPES**

types/

api.ts

user.ts

camera.ts

event.ts

training.ts

safety.ts

asset.ts

report.ts

---

All API Responses Must Be Typed

---

# **TABLE STANDARD**

Use TanStack Table

---

Maximum Visible Columns

7

---

Large Datasets

Use Virtualization

---

# **PERFORMANCE RULES**

Use React.memo

Use useMemo

Use useCallback

Lazy Load Heavy Components

Virtualize Long Lists

Avoid Unnecessary Re-renders

---

# **RESPONSIVE**

Desktop First

Supported Widths

1920

1600

1440

1366

---

Mobile

Not Required Phase 1

---

# **ERROR HANDLING**

Loading State

Empty State

Error State

Must Exist For Every Page

---

# **SECURITY**

No Hardcoded Secrets

No Mock Credentials

No Sensitive Data In UI

---

# **CODE QUALITY**

Strict TypeScript

No Any

Reusable Components First

Keep Business Logic Outside UI

---

# **ARCHITECTURE PRINCIPLE**

PRD Defines Business

UI-SPEC Defines Layout

STYLE-GUIDE Defines Design

TECHNICAL Defines Code Architecture

CURSOR-RULES Enforces Consistency

All Development Must Follow These Documents.