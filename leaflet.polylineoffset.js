L.PolylineOffset = {
    translatePoint: function(pt, dist, radians) {
        return L.point(pt.x + dist * Math.cos(radians), pt.y + dist * Math.sin(radians));
    },

    forEachPair: function(list, callback) {
        if (!list || list.length < 1) { return; }
        for (var i = 1, l = list.length; i < l; i++) {
            callback(list[i-1], list[i]);
        }
    },

    offsetPointLine: function(points, distance) {
        var offsetSegments = [];
        var xs, ys, sqDist;
        var offsetAngle, segmentAngle;
        var sqDistance = distance * distance;

        this.forEachPair(points, L.bind(function(a, b) {
            xs = b.x - a.x;
            ys = b.y - a.y;
            sqDist = xs * xs + ys * ys;
            // angle in (-PI, PI]
            segmentAngle = Math.atan2(a.y - b.y, a.x - b.x);
            // angle in (-1.5 * PI, PI/2]
            offsetAngle = segmentAngle - Math.PI/2;

            // store offset point and other information to avoid recomputing it later
            if (sqDist > sqDistance) {
                offsetSegments.push({
                    angle: segmentAngle,
                    offsetAngle: offsetAngle,
                    distance: distance,
                    original: [a, b],
                    offset: [
                        this.translatePoint(a, distance, offsetAngle),
                        this.translatePoint(b, distance, offsetAngle)
                    ]
                });
            }
        }, this));

        return offsetSegments;
    },

    offsetPoints: function(pts, offset) {
        var offsetSegments = this.offsetPointLine(pts, offset);
        return this.joinLineSegments(offsetSegments, offset);
    },

    /**
    Return the intersection point of two lines defined by two points each
    Return null when there's no unique intersection
    */
    intersection: function(l1a, l1b, l2a, l2b) {
        var line1 = this.lineEquation(l1a, l1b);
        var line2 = this.lineEquation(l2a, l2b);

        if (line1 === null || line2 === null) {
            return null;
        }

        if (line1.hasOwnProperty('x')) {
            if (line2.hasOwnProperty('x')) {
                return null;
            }
            return L.point(line1.x, line2.a * line1.x + line2.b);
        }
        if (line2.hasOwnProperty('x')) {
            return L.point(line2.x, line1.a * line2.x + line1.b);
        }

        if (line1.a === line2.a) {
            return null;
        }

        var x = (line2.b - line1.b) / (line1.a - line2.a);
        var y = line1.a * x + line1.b;

        return L.point(x, y);
    },

    /**
    Find the coefficients (a,b) of a line of equation y = a.x + b,
    or the constant x for vertical lines
    Return null if there's no equation possible
    */
    lineEquation: function(pt1, pt2) {
        if (pt1.x !== pt2.x) {
            var a = (pt2.y - pt1.y) / (pt2.x - pt1.x);
            return {
                a: a,
                b: pt1.y - a * pt1.x
            };
        }

        if (pt1.y !== pt2.y) {
            return { x: pt1.x };
        }

        return null;
    },

    /**
    Join 2 line segments defined by 2 points each with a circular arc
    */
    joinSegments: function(s1, s2, offset) {
        // TODO: different join styles
        return this.circularArc(s1, s2, offset);
    },

    joinLineSegments: function(segments, offset) {
        var joinedPoints = [];
        var first = segments[0];
        var last = segments[segments.length - 1];

        if (first && last) {
            joinedPoints.push(first.offset[0]);
            this.forEachPair(segments, L.bind(function(s1, s2) {
                joinedPoints = joinedPoints.concat(this.joinSegments(s1, s2, offset));
            }, this));
            joinedPoints.push(last.offset[1]);
        }

        return joinedPoints;
    },

    /**
    Interpolates points between two offset segments in a circular form
    */
    circularArc: function(s1, s2, distance) {
        if (s1.angle === s2.angle) {
            return [s1.offset[1]];
        }

        var center = s1.original[1];
        var points = [];
        var startAngle;
        var endAngle;

        if (distance < 0) {
            startAngle = s1.offsetAngle;
            endAngle = s2.offsetAngle;
        } else {
            // switch start and end angle when going right
            startAngle = s2.offsetAngle;
            endAngle = s1.offsetAngle;
        }

        if (endAngle < startAngle) {
            endAngle += Math.PI * 2; // the end angle should be bigger than the start angle
        }

        if (endAngle > startAngle + Math.PI) {
            return [this.intersection(s1.offset[0], s1.offset[1], s2.offset[0], s2.offset[1])];
        }

        // Step is distance dependent. Bigger distance results in more steps to take
        var step = Math.abs(8/distance);
        for (var a = startAngle; a < endAngle; a += step) {
            points.push(this.translatePoint(center, distance, a));
        }
        points.push(this.translatePoint(center, distance, endAngle));

        if (distance > 0) {
            // reverse all points again when going right
            points.reverse();
        }

        return points;
    }
}

// Modify the L.Polyline class by overwriting the projection function,
L.Polyline.include({
    _projectLatlngs: function (latlngs, result, projectedBounds) {
        var isFlat = latlngs.length > 0 && latlngs[0] instanceof L.LatLng;

        if (isFlat) {
            var ring = latlngs.map(L.bind(function(ll) {
                var point = this._map.latLngToLayerPoint(ll);
                if (projectedBounds) {
                    projectedBounds.extend(point);
                }
                return point;
            }, this));

            // Offset management hack ---
            if (this.options.offset) {
                ring = L.PolylineOffset.offsetPoints(ring, this.options.offset);
            }
            // Offset management hack END ---

            result.push(ring);
        } else {
            latlngs.forEach(L.bind(function(ll) {
                this._projectLatlngs(ll, result, projectedBounds);
            }, this));
        }
    }
});

L.Polyline.include({
    setOffset: function(offset) {
        this.options.offset = offset;
        this.redraw();
        return this;
    }
});
