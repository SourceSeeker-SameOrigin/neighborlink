"""Draw original, reproducible UI icons. Development asset tool; no runtime dependency."""
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[1] / 'miniprogram/assets'
S = 4
GREEN = '#1F7A5C'
INK = '#20583F'
SAGE = '#E6EEDB'
GOLD = '#F4D397'

def icon(name, color=INK, accent=GOLD, solid=False):
    im=Image.new('RGBA',(96*S,96*S)); d=ImageDraw.Draw(im)
    def pts(p): return [(int(x*S),int(y*S)) for x,y in p]
    def line(p,w=4,fill=color): d.line(pts(p),fill=fill,width=w*S,joint='curve')
    def rect(b,fill=None,r=7,w=4): d.rounded_rectangle(tuple(int(x*S) for x in b),radius=r*S,fill=fill,outline=color,width=w*S)
    def oval(b,fill=None,w=4): d.ellipse(tuple(int(x*S) for x in b),fill=fill,outline=color,width=w*S)
    def poly(p,fill=None,w=4):
        d.polygon(pts(p),fill=fill); line(p+[p[0]],w)
    if name=='home' and solid:
        poly([(12,43),(48,12),(84,43),(75,43),(75,83),(56,83),(56,58),(40,58),(40,83),(21,83),(21,43)],color,3)
    elif name=='me' and solid:
        oval((32,12,64,44),color,0);d.pieslice((15*S,46*S,81*S,112*S),180,360,fill=color)
    elif name in ('home','vacant'):
        poly([(12,43),(48,12),(84,43)],SAGE); line([(22,38),(22,82),(74,82),(74,38)]);rect((38,55,58,82),accent,3)
        if name=='vacant': oval((56,46,85,75),'#FFF');line([(79,70),(91,83)],5)
    elif name in ('orders','legal','notice'):
        rect((23,16,74,83),'#FFF',7);rect((36,10,60,24),accent,4)
        for y in (39,52,65):line([(34,y),(62,y)],3)
        if name=='notice': line([(76,27),(88,20)],3);line([(79,39),(92,39)],3)
    elif name=='avatar':
        oval((3,3,93,93),SAGE,0)
        d.pieslice((17*S,61*S,79*S,110*S),180,360,fill='#76A57A',outline=color,width=2*S)
        rect((40,55,58,74),'#FFE0B1',5,2)
        oval((24,22,74,66),'#FFE0B1',2)
        poly([(24,43),(20,32),(24,18),(37,12),(55,15),(68,10),(72,20),(69,28),(76,35),(72,47),(65,36),(59,27),(49,32),(36,29),(32,41)],'#294C3A',2)
        oval((35,41,39,47),color,0);oval((56,41,60,47),color,0)
        d.arc((42*S,48*S,54*S,59*S),5,160,fill=color,width=2*S)
    elif name=='me':
        oval((32,14,64,46),accent);d.arc((16*S,45*S,80*S,100*S),180,360,fill=color,width=4*S);line([(16,72),(16,82),(80,82),(80,72)])
    elif name=='express':
        poly([(14,29),(49,13),(82,29),(82,68),(48,85),(14,68)],accent);line([(14,29),(48,46),(82,29)]);line([(48,46),(48,85)]);line([(32,21),(65,38),(65,51)],3)
    elif name=='trash':
        rect((24,25,74,83),'#6CA653',6);rect((18,20,80,28),'#A3C877',3);rect((37,11,61,20),SAGE,3)
        line([(37,52),(46,39),(55,42)],4,'#FFF');line([(57,46),(63,59),(58,66)],4,'#FFF');line([(51,68),(36,68),(32,59)],4,'#FFF')
    elif name=='buy':
        oval((29,5,41,29),SAGE,2);oval((45,4,56,31),'#87B977',2);oval((59,12,74,34),'#A5C983',2)
        line([(35,18),(39,48)],3);line([(51,19),(48,48)],3)
        poly([(22,30),(74,30),(80,82),(16,82)],accent);d.arc((31*S,12*S,65*S,49*S),180,360,fill=color,width=4*S);line([(32,30),(32,43)],3);line([(64,30),(64,43)],3)
    elif name in ('help','board'):
        oval((10,20,50,60),accent,3);oval((46,20,86,60),accent,3)
        poly([(10,40),(26,22),(42,24),(49,31),(63,23),(85,40),(76,56),(53,78),(42,77),(18,55)],accent,3)
        line([(49,31),(34,44),(42,52),(56,42),(74,59)],4);line([(27,56),(42,72)],3);line([(35,49),(54,69)],3)
    elif name=='pet':
        oval((24,33,74,82),accent);poly([(27,40),(13,22),(13,58),(26,66)],SAGE);poly([(70,40),(84,22),(85,58),(74,66)],SAGE)
        oval((35,49,39,53),color,1);oval((59,49,63,53),color,1);oval((43,62,55,69),color,1);line([(49,68),(49,75)],3)
    elif name=='elder':
        oval((26,15,70,59),accent);line([(28,32),(36,23),(47,29),(57,23),(68,32)],4);oval((33,35,45,45),'#FFF',2);oval((52,35,64,45),'#FFF',2);line([(45,39),(52,39)],2)
        d.arc((16*S,56*S,80*S,106*S),180,350,fill=color,width=4*S);line([(23,78),(23,85),(75,85),(75,78)],4)
    elif name=='recycle':
        for p in [[(27,30),(41,12),(57,14),(66,28)],[(73,34),(85,55),(77,70),(60,70)],[(50,78),(23,78),(14,63),(23,48)]]:line(p,7)
        poly([(58,19),(69,31),(74,15)],SAGE,2);poly([(68,60),(55,70),(68,82)],SAGE,2);poly([(14,48),(25,42),(31,55)],SAGE,2)
    elif name=='shop':
        rect((18,37,78,83),'#FFF',3);poly([(14,37),(23,14),(73,14),(83,37)],accent);line([(14,37),(83,37)]);line([(35,16),(31,37)],3);line([(60,16),(65,37)],3);rect((27,52,47,83),SAGE,2);rect((55,51,68,65),accent,2)
    elif name=='idle':
        rect((18,31,78,83),SAGE,4);rect((13,24,83,39),accent,4);line([(48,24),(48,83)],3);oval((27,9,48,25),accent,3);oval((48,9,69,25),accent,3)
    elif name=='events':
        rect((16,21,80,83),'#FFF',7);line([(16,39),(80,39)],3);line([(31,12),(31,29)],4);line([(65,12),(65,29)],4);line([(31,61),(43,71),(65,49)],5)
    elif name=='travel':
        rect((12,42,84,74),SAGE,8);poly([(22,42),(31,24),(65,24),(76,42)],'#FFF');oval((22,67,37,83),accent,3);oval((60,67,75,83),accent,3);line([(24,56),(32,56)],4);line([(65,56),(73,56)],4)
    elif name in ('ticket','coupon'):
        poly([(14,23),(82,23),(82,39),(74,45),(74,53),(82,59),(82,76),(14,76),(14,59),(22,53),(22,45),(14,39)],'#FFF1D8')
        for y in range(34,68,10):line([(58,y),(58,y+4)],2)
        line([(33,46),(39,53),(49,39)],4)
    elif name in ('pin','location'):
        d.ellipse((21*S,10*S,75*S,62*S),fill=SAGE,outline=color,width=4*S);poly([(22,47),(48,86),(74,47)],SAGE);oval((37,26,59,48),'#FFF',3)
    elif name=='phone':
        rect((29,10,67,86),'#FFF',7);line([(40,18),(56,18)],3);oval((45,75,51,81),accent,2)
    elif name=='support':
        d.arc((16*S,14*S,80*S,83*S),180,360,fill=color,width=5*S);rect((12,45,27,71),accent,5);rect((69,45,84,71),accent,5);line([(77,70),(72,81),(56,85)],4);rect((43,80,57,88),SAGE,3)
    elif name in ('shield','admin'):
        poly([(48,10),(78,24),(74,58),(63,74),(48,85),(33,74),(22,58),(18,24)],SAGE);line([(34,46),(44,57),(64,33)],5)
    elif name=='chat':
        rect((12,17,84,70),'#FFF',12);poly([(27,69),(24,86),(46,70)],'#FFF',3)
        for x in (30,48,66):oval((x-2,41,x+2,45),color,1)
    elif name=='building':
        rect((19,21,59,85),SAGE,3);rect((59,39,80,85),accent,3)
        for x in (28,44):
            for y in (32,47,62):rect((x,y,x+6,y+6),'#FFF',1,2)
        rect((33,73,46,85),'#FFF',1,2)
    elif name=='empty':
        rect((21,16,75,81),'#FFF',9);line([(33,36),(63,36)],3);line([(33,48),(56,48)],3);d.arc((35*S,57*S,61*S,77*S),190,350,fill=color,width=3*S)
    else: raise ValueError(name)
    return im.resize((96,96),Image.Resampling.LANCZOS)

(ROOT/'icons').mkdir(parents=True,exist_ok=True)
for name in ['home','vacant','orders','legal','notice','me','avatar','express','trash','buy','help','board','pet','elder','recycle','shop','idle','events','travel','ticket','coupon','pin','phone','support','shield','admin','chat','building','empty']:
    icon(name).save(ROOT/'icons'/f'{name}.png',optimize=True)
for name in ['home','orders','me']:
    for selected in [False,True]:
        icon(name,GREEN if selected else '#70796F','#DCEBD8' if selected else '#F7F6F1',solid=selected).resize((72,72),Image.Resampling.LANCZOS).save(ROOT/'tab'/(name+('-selected' if selected else '')+'.png'),optimize=True)
print('Generated 29 original icons and 6 distinct tab assets')
