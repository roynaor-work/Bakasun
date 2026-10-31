"""Small original geometry authoring helpers; coordinates are metres, Y up, +Z front."""
from __future__ import annotations
import math
import numpy as np


PALETTE = {
    'skin': '#BF8054', 'hair': '#263443', 'shirt': '#27C9A0',
    'shorts': '#173B50', 'socks': '#F2F4EE', 'shoes': '#FF795B',
    'soles': '#E9ECE6', 'gloves': '#F5D366', 'helmet': '#FF8069',
    'equipment': '#263D63', 'accent': '#FFF0B8',
}


def linear_rgb(color):
    if isinstance(color, str):
        rgb = np.array([int(color.lstrip('#')[i:i+2], 16) / 255 for i in (0, 2, 4)])
        return np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4).tolist()
    return list(color)


class Mesh:
    """Indexed geometry and skin data with uniform source color per submitted part.

    ``add`` keeps the submitted topology intact: adjacent loft rings share vertices,
    while garment boundaries and facial details remain explicit separate surfaces.
    """
    def __init__(self, rig_names=None, palette=None):
        self.positions = []
        self.indices = []
        self.colors = []
        self.joints = []
        self.weights = []
        self.regions = []
        self.parts = []
        self.rig_names = list(rig_names or [])
        self.palette = {**PALETTE, **(palette or {})}

    def add(self, vertices, faces, region, weights, color=None):
        vertices = np.asarray(vertices, dtype=float)
        faces = np.asarray(faces, dtype=int).reshape(-1, 3)
        if not len(vertices) or not len(faces):
            return
        offset = len(self.positions)
        rgb = linear_rgb(color if color is not None else self.palette.get(region, '#FFFFFF'))
        per_vertex = [weights] * len(vertices) if isinstance(weights, dict) else weights
        if len(per_vertex) != len(vertices):
            raise ValueError('Expected one weight dictionary per vertex')
        for vertex, influence in zip(vertices, per_vertex):
            ordered = sorted(((k, float(v)) for k, v in influence.items() if v > 1e-8), key=lambda kv: -kv[1])
            if not 1 <= len(ordered) <= 4:
                raise ValueError('Each vertex needs 1–4 positive skin weights')
            total = sum(value for _, value in ordered)
            ids = [self.rig_names.index(name) if isinstance(name, str) else name for name, _ in ordered]
            self.positions.append(vertex.tolist())
            self.colors.append(rgb.copy())
            self.joints.append(ids + [0] * (4 - len(ids)))
            self.weights.append([value / total for _, value in ordered] + [0.] * (4 - len(ids)))
            self.regions.append(region)
        # Drop collapsed triangles from tapered loft endpoints, never retain zero area.
        kept = []
        for a, b, c in faces:
            if np.linalg.norm(np.cross(vertices[b] - vertices[a], vertices[c] - vertices[a])) > 1e-12:
                kept.append([offset + int(a), offset + int(b), offset + int(c)])
        self.indices.extend(kept)
        self.parts.append({'region': region, 'firstVertex': offset, 'vertexCount': len(vertices),
                           'firstTriangle': len(self.indices) - len(kept), 'triangles': len(kept), 'linearRGB': rgb})

    def ellipsoid(self, center, radii, region, weights, segments=24, rings=12, color=None):
        center = np.asarray(center, dtype=float)
        radii = np.asarray(radii, dtype=float)
        vertices = [center + (0, -radii[1], 0)]
        for row in range(1, rings):
            latitude = -math.pi / 2 + math.pi * row / rings
            for column in range(segments):
                longitude = 2 * math.pi * column / segments
                vertices.append(center + radii * [math.cos(latitude) * math.cos(longitude),
                                                  math.sin(latitude), math.cos(latitude) * math.sin(longitude)])
        vertices.append(center + (0, radii[1], 0))
        faces = []
        for k in range(segments):
            faces.append((0, 1 + k, 1 + (k + 1) % segments))
        for row in range(rings - 2):
            a = 1 + row * segments
            b = a + segments
            for k in range(segments):
                n = (k + 1) % segments
                faces.extend([(a + k, b + k, a + n), (a + n, b + k, b + n)])
        top = len(vertices) - 1
        start = top - segments
        for k in range(segments):
            faces.append((start + k, top, start + (k + 1) % segments))
        self.add(vertices, faces, region, weights, color=color)

    def tube(self, points, radii, region, weights, segments=12, color=None, caps=True):
        points = np.asarray(points, dtype=float)
        if len(points) < 2:
            raise ValueError('Tube needs at least two rings')
        if isinstance(radii, (int, float)):
            radii = [radii] * len(points)
        if len(radii) != len(points):
            raise ValueError('Expected one radius or radius pair per tube ring')
        ring_weights = [weights] * len(points) if isinstance(weights, dict) else weights
        vertices, per_vertex = [], []
        frames = []
        for row, point in enumerate(points):
            tangent = points[min(row + 1, len(points) - 1)] - points[max(0, row - 1)]
            tangent /= max(1e-12, np.linalg.norm(tangent))
            # The reference is fixed for a limb, avoiding unexpected cross-section flips.
            reference = np.array([0., 0., 1.])
            if abs(float(tangent @ reference)) > .96:
                reference = np.array([1., 0., 0.])
            u = np.cross(tangent, reference)
            u /= np.linalg.norm(u)
            v = np.cross(u, tangent)
            frames.append((u, v))
            radius = radii[row]
            ru, rv = (radius, radius) if np.isscalar(radius) else radius
            for column in range(segments):
                angle = 2 * math.pi * column / segments
                vertices.append(point + u * ru * math.cos(angle) + v * rv * math.sin(angle))
                per_vertex.append(ring_weights[row])
        faces = []
        for row in range(len(points) - 1):
            for column in range(segments):
                n = (column + 1) % segments
                a, b = row * segments, (row + 1) * segments
                faces.extend([(a + column, b + column, a + n), (a + n, b + column, b + n)])
        if caps:
            # Separate cap centers avoid duplicated zero-area pole triangles.
            first_center = len(vertices)
            vertices.append(points[0]); per_vertex.append(ring_weights[0])
            last_center = len(vertices)
            vertices.append(points[-1]); per_vertex.append(ring_weights[-1])
            for column in range(segments):
                n = (column + 1) % segments
                faces.append((first_center, column, n))
                a = (len(points) - 1) * segments
                faces.append((last_center, a + n, a + column))
        self.add(vertices, faces, region, per_vertex, color=color)

    @property
    def normals(self):
        vertices = np.asarray(self.positions, dtype=float)
        normals = np.zeros_like(vertices)
        for a, b, c in self.indices:
            normal = np.cross(vertices[b] - vertices[a], vertices[c] - vertices[a])
            normals[a] += normal; normals[b] += normal; normals[c] += normal
        lengths = np.linalg.norm(normals, axis=1)
        normals[lengths > 1e-12] /= lengths[lengths > 1e-12, None]
        normals[lengths <= 1e-12] = [0, 1, 0]
        return normals.tolist()

    def to_dict(self):
        sources = {}
        for part in self.parts:
            rgb = part['linearRGB']
            key = tuple(round(float(x), 12) for x in rgb)
            region = 'preserve' if part['region'].startswith('preserve') else part['region']
            if key in sources and sources[key]['region'] != region:
                raise ValueError(f'Source color collision: {sources[key]["region"]}/{region}')
            values = np.asarray(rgb)
            srgb = np.where(values <= .0031308, values * 12.92,
                            1.055 * np.maximum(values, 0) ** (1 / 2.4) - .055)
            code = '#' + ''.join(f'{int(np.clip(round(x * 255), 0, 255)):02X}' for x in srgb)
            sources[key] = {'linearRGB': rgb, 'region': region, 'hex': code}
        return {'positions': self.positions, 'normals': self.normals,
                'indices': self.indices, 'colors': self.colors,
                'joints': self.joints, 'weights': self.weights,
                'colorSources': list(sources.values()), 'parts': self.parts}
