import heapq

def dijkstra(graph,start,end):
    pq = [(0,start)]


    dist = {node:float('inf') for node in graph}
    dist[start] = 0
    parent = {}

    while pq:
        cost, node = heapq.heappop(pq)

        for neighbor, weight in graph[node].itens():
            new_cost = cost+weight

            if new_cost < dist[neighbor]:
                dist[neighbor] = new_cost
                parent[neighbor] = node
                heapq.heappush(pq, (new_cost, neighbor))

    path = []
    cur = end
    while cur:
        path.append(cur)
        cur = parent.get(cur)

    return path[::-1]
